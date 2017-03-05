#!/usr/bin/env node

const trainline = require('./trainline.js');
const program = require('commander');
const storage = require('node-persist');
const colors = require('colors');
const moment = require('moment');
const Table = require('cli-table2');
const fuzzy = require('fuzzy');
const inquirer = require('inquirer');
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

// Connected user infos
var uinfos;

// storage configuration
storage.init({
  stringify: JSON.stringify,
  parse: JSON.parse,
  encoding: 'utf8',
  ttl: false
}).then(() => {
  storage.getItem('uinfos').then(infos => {
    uinfos = infos;
    loadUserInfos();
    main();
  });
});

program
  .version('1.0.0')
  .option('-l, --login [email]', 'Log in to your Trainline account')
  .option('-L, --logout', 'Logout of your Trainline account')
  .option('-s, --search', 'Search for a trip')
  .option('-t, --trips', 'List of your trips')
  .option('-a, --buy', 'Buy trips in your basket')
  .option('-b, --basket', 'List of your options')
  .parse(process.argv);

function menu() {
  inquirer.prompt([
    {
      type: 'list',
      name: 'menu',
      message: 'What do you want to do:',
      choices: [
        { name: 'Search for a trip', value: searchForTrips },
        { name: 'Pay for a trip in my basket', value: buyFromBasket },
        { name: 'Consult my booked trips', value: consultBookedTrips },
        { name: 'Logout', value: logout },
        { name: 'Exit', value: () => { return Promise.reject(); } },
      ],
      pageSize: 20
    }
  ]).then(choice => {
    let selection = choice.menu;
    return selection();
  }).then(() => {
    if (uinfos) {
      return menu();
    }
  }).catch(() => {});
}

let firstTime = true;

function main() {
  let firstTimeo = firstTime;
  firstTime = false;

  // Login
  if (program.login) {
    if (uinfos) {
      displayError('You are already connected.');
      return;
    }
    login(program.login);
    return;
  }

  // The following actions need a user to be connected
  if (!uinfos) {
    if (firstTimeo) {
      displayInfo('First you need to login to your Trainline account:');
    }
    return login().then(main);
  }

  // Logout
  if (program.logout) {
    logout();
  }

  if (program.trips) {
    consultBookedTrips();
  }

  if (program.basket) {
    trainline.basket().then(trips => {
      console.log(tripsToTable(trips));
    });
  }

  if (program.buy) {
    buyFromBasket();
  }

  if (program.search) {
    searchForTrips().then(menu);
  }

  // If no specific action specified, display the menu
  menu();
}

function loadUserInfos() {
  if (uinfos && uinfos.meta && uinfos.meta.token) {
    trainline.TOKEN = uinfos.meta.token;
    trainline.USER_ID = uinfos.user.id;

    displayInfo('Welcome ' + uinfos.user.first_name + ' ' + uinfos.user.last_name + '!');
  }
}

function login(email) {
  let questions = [];
  if (!email) {
    questions.push({
      type: 'input',
      name: 'email',
      message: 'Email address:'
    });
  }
  questions.push({
    type: 'password',
    name: 'password',
    message: 'Trainline password:'
  });
  return inquirer.prompt(questions).then(answers => {
    let login = email || answers.email;
    return trainline.connexion(login, answers.password);
  }).then(infos => {
    uinfos = infos;
    return storage.setItem('uinfos', infos);
  }).then(() => {
    loadUserInfos();
  }).catch(err => {
    displayError('Wrong password or wrong email address.');
  });
}

function logout() {
  return storage.removeItem('uinfos').then(() => {
    uinfos = null;
    displayInfo('You are now disconnected.');
  });
}

/**
 * Consult booked trips
 */
function consultBookedTrips() {
  let spinner = startSpinner();
  return trainline.trips().then(trips => {
    spinner.stop(true);
    console.log(tripsToTable(trips.slice(0, 7)));
  });
}

/**
 * Interactive session for searching for train tickets
 */
function searchForTrips() {
  let dates = getNextDays(90);
  let spinner;

  return inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'from',
      suggestOnly: false,
      message: 'From:',
      source: searchStation,
      pageSize: 5
    },
    {
      type: 'autocomplete',
      name: 'to',
      suggestOnly: false,
      message: 'To:',
      source: searchStation,
      pageSize: 5
    },
    {
      type: 'autocomplete',
      name: 'departure_date',
      suggestOnly: false,
      message: 'Departure date:',
      source: (answers, input) => {
        return Promise.resolve(fuzzy.filter(input || '', dates).map(e => { return e.string }));
      },
      pageSize: 5
    },
    {
      type: 'list',
      name: 'hour',
      message: 'Time:',
      choices: ['14h', '16h', '18h', '20h', '22h', '6h', '8h', '10h', '12h']
    },
    {
      type: 'checkbox',
      name: 'passengers',
      message: 'Passengers:',
      choices: uinfos.passengers.map(passenger => {
        return {
          checked: passenger.is_selected,
          name: passenger.first_name + ' ' + passenger.last_name,
          value: {
            id: passenger.id,
            card_ids: passenger.card_ids
          }
        }
      }).sort((a, b) => {
        return a.checked;
      })
    }
  ]).then(answers => {
    spinner = startSpinner();

    // We need to find the ids of the selected stations
    let sq1 = trainline.searchStation(answers.from);
    let sq2 = trainline.searchStation(answers.to);
    return Promise.all([answers, sq1, sq2]);
  }).then(queries => {
    let answers = queries[0];
    let departure_station_id = queries[1][0].id;
    let arrival_station_id = queries[2][0].id;
    let departure_date = moment(colors.strip(answers.departure_date) + ' ' + answers.hour, 'dddd, MMMM D H[h]').format();
    let passengers = answers.passengers;
    let passenger_ids = passengers.map(p => { return p.id });
    let card_ids = passengers.reduce((acc, p) => { return acc.concat(p.card_ids) }, []);

    return trainline.searchTrips(departure_station_id, arrival_station_id, passenger_ids, card_ids, departure_date);
  }).then(trips => {
    trips = humanifyTrips(trips);
    let choices = [];
    choices.push(new inquirer.Separator());
    trips.forEach(trip => {
      let table = new Table({ chars: { 'top': '' , 'top-mid': '' , 'top-left': '' , 'top-right': ''
       , 'bottom': '' , 'bottom-mid': '' , 'bottom-left': '' , 'bottom-right': ''
       , 'left': '' , 'left-mid': '' , 'mid': '' , 'mid-mid': ''
       , 'right': '' , 'right-mid': '' , 'middle': ' ' },
style: { 'padding-left': 0, 'padding-right': 0 }, colWidths: [20, 100] });
      let duration = colors.white(formatDuration(moment(trip.arrival_date) - moment(trip.departure_date)));
      let departure_time = colors.green(moment(trip.departure_date).format('HH:mm'));
      let arrival_time = colors.green(moment(trip.arrival_date).format('HH:mm'));
      let price = trip.travel_classes.economy.cents/100;
      if (trip.travel_classes.first) {
        price += ' / ' + trip.travel_classes.first.cents/100;
      }
      price += ' ' + trip.travel_classes.economy.currency;
      table.push([duration, departure_time + '  ' + colors.bold(trip.departure_station)]);
      trip.stops.forEach(stop => {
        table.push(['  ', '      ' + colors.magenta(formatDuration(stop.duration) + '  ' + stop.station)]);
      });
      table.push(['  ' + price, '  ' + arrival_time + '  ' + colors.bold(trip.arrival_station)]);

      choices.push({
        name: table.toString(),
        value: trip.travel_classes,
        short: trip.departure_station + ' ' + colors.green(departure_time) + ' > ' + colors.green(arrival_time) + ' ' + trip.arrival_station
      });
      choices.push(new inquirer.Separator());
    });

    spinner.stop(true);

    return inquirer.prompt([
      {
        type: 'list',
        name: 'trip',
        message: 'Available trips:',
        choices: choices,
        pageSize: 20
      }
    ]);
  }).then(answers => {
    let travel_classes = answers.trip;
    if (Object.keys(travel_classes).length > 1) {
      return inquirer.prompt([
        {
          type: 'list',
          name: 'tobook',
          message: 'Travel class:',
          choices: [
            {
              name: 'Economy: ' + travel_classes.economy.cents/100 + ' ' + travel_classes.economy.currency,
              value: travel_classes.economy.tobook
            },
            {
              name: 'First: ' + travel_classes.first.cents/100 + ' ' + travel_classes.first.currency,
              value: travel_classes.first.tobook
            }
          ]
        }
      ])
    } else {
      return Promise.resolve({tobook: travel_classes[Object.keys(travel_classes)[0]].tobook});
    }
  }).then(trip => {
    spinner = startSpinner();
    return trainline.bookTrip(trip.tobook.search_id, trip.tobook.folder_id);
  }).then(result => {
    spinner.stop(true);
    displaySuccess('Your trip has been added to your basket!');
  });
}

/**
 * Interactive session from selecting trips to buy in the basket,
 * to paying for them
 */
function buyFromBasket() {
  let finalPnrs, trips;

  let spinner = startSpinner();

  return trainline.basket().then(tripso => {
    trips = tripso;
    let choices = [];
    choices.push(new inquirer.Separator());
    tripsToArrayOfTables(trips, true, '   ').forEach(trip => {
      choices.push({
        name: trip.forDisplay,
        checked: trip.details.is_selected,
        value: trip.details,
        short: trip.short
      });
      choices.push(new inquirer.Separator());
    });
    spinner.stop(true);
    return inquirer.prompt([
      {
        type: 'checkbox',
        name: 'pnrs',
        message: 'Select your trips:',
        choices: choices,
        pageSize: 20
      }
    ])
  }).then(answers => {
    spinner = startSpinner();

    finalPnrs = answers.pnrs;
    // Now we will select the right pnrs and unselect the other
    let pnrsToChange = [];
    let selectedPnrs = answers.pnrs.map(pnr => { return pnr.pnr_id });
    trips.forEach(trip => {
      let isSelected = (selectedPnrs.indexOf(trip.pnr_id) > -1);
      if ((trip.is_selected && !isSelected) || (!trip.is_selected && isSelected)) {
        pnrsToChange.push({
          pnr_id: trip.pnr_id,
          is_selected: isSelected
        });
      }
    });

    let pnrsq = new Promise((resolve, reject) => {
      let i = 0;
      // Trainline seems not to accept changing too fast multiple pnrs
      // So I do it sequentially
      function selectNextPnr() {
        if (i >= pnrsToChange.length) {
          return resolve();
        }
        let pnr = pnrsToChange[i];
        i++;
        trainline.selectPnr(pnr.pnr_id, pnr.is_selected).then(selectNextPnr);
      }
      selectNextPnr();
    });
    return Promise.all([trainline.paymentCards(), pnrsq]);
  }).then(qs => {
    let payment_cards = qs[0].payment_cards.map(c => {
      return {
        name: c.label + ' (' + c.type + ' xxxx xxxx xxxx ' + c.last_digits + ')',
        value: c.id
      }
    });

    spinner.stop(true);

    return inquirer.prompt([
      {
        type: 'list',
        name: 'card',
        message: 'Credit card:',
        choices: payment_cards,
        pageSize: 4
      },
      {
        type: 'password',
        name: 'cvv',
        message: 'CVV:'
      },
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Do you confirm the payment of ' + finalPnrs.length + ' ticket' + s(finalPnrs.length) + ' for ' + finalPnrs.reduce((acc, pnr) => { return acc + pnr.cents }, 0)/100 + ' EUR?'
      }
    ]);
  }).then(answers => {
    if (!answers.confirm) {
      displayError('Aborting.');
      return Promise.reject();
    }
    if (!answers.cvv || answers.cvv.length != 3) {
      displayError('The CVV must have three characters.');
      return Promise.reject();
    }
    spinner = startSpinner();
    return trainline.payForPnrs(answers.card, answers.cvv, finalPnrs);
  }).then(payment => {
    spinner.stop(true);
    if (payment.payment.status != 'success') {
      displayError('An error occurred. Please check your card and CVV.');
      return;
    }
    let m = 'The payment was successful, your ';
    if (finalPnrs.length > 1) {
      m += 'trips have';
    } else {
      m += 'trip has';
    }
    m += 'been booked! You should receive an email in a minute.';
    displaySuccess(m);
  }).catch((err) => {});
}

/**
 * Adapt a list of trips from a search
 * for an easy display. Compute the list of stops from the list of segments.
 * @param {trips} array({})
 * @return array({})
 */
function humanifyTrips(trips) {
  trips.forEach(trip => {
    trip.stops = [];
    for (let i = 1; i < trip.segments.length; i++) {
      let segment = trip.segments[i];
      let psegment = trip.segments[i-1];
      let stop = {
        station: segment.departure_station,
        train_name: segment.train_name,
        duration: (moment(segment.departure_date) - moment(psegment.arrival_date))
      };
      trip.stops.push(stop);
    }
  });

  return trips;
};

/**
 * Format for a human the duration in seconds
 * @param {duration} number The duration in ms
 * @return string
 */
function formatDuration(duration) {
  function fillz(n) {
    if (n < 10) {
      return '0' + n;
    }
    return n;
  }
  duration = duration/1000;
  let o = '';
  if ((duration % 3600) != 0) {
    o = Math.ceil((duration%3600)/60);
  }
  if (duration >= 3600) {
    o = Math.floor(duration/3600) + 'h' + fillz(o);
  } else {
    o += ' min';
  }
  return o;
}

/**
 * Return the next `limit` days, to a human format
 * @param {limit} number The number of days to return
 * @return array(string)
 */
function getNextDays(limit) {
  let dates = [];
  let currentDate = moment();
  for (let i = 0; i < limit; i++) {
    let d = currentDate.format('dddd, MMMM D');
    if (currentDate.isoWeekday() >= 6) {
      d = colors.green(d);
    }
    if (i <= 1) {
      d = colors.bold(d);
    }
    dates.push(d);
    currentDate.add(1, 'days');
  }
  return dates;
}

/**
 * Search for a station
 * If no query, return the most popular stations of the user
 * @param {answers} array The previous answers
 * @param {input} string The query
 * @return Promise([string])
 */
function searchStation(answers, input) {
  return (function() {
    if (input) {
      return trainline.searchStation(input);
    }
    return Promise.resolve(uinfos.stations);
  }()).then(stations => {
    return stations.map(s => s.name);
  });
}

/**
 * Create an array ready to be displayed from the trips
 * @param {trips} array List of trips
 * @param {hideRef} boolean Hide the reference of the trip (useful for basket, where trips don't have references yet)
 * @param {offset} string String which will be added at the beginning of new lines (useful for Inquirer)
 * @return array({details, short, forDisplay})
 */
function tripsToArrayOfTables(trips, hideRef, offset) {
  offset = offset || '';
  let nl = '\n' + offset;

  let o = [];

  // We will create a complete table with cli-table2
  // so everything will be correctly aligned
  // And then we will split it
  let table = new Table({
    chars: { 'top': '' , 'top-mid': '' , 'top-left': '' , 'top-right': ''
     , 'bottom': '' , 'bottom-mid': '' , 'bottom-left': '' , 'bottom-right': ''
     , 'left': '' , 'left-mid': '' , 'mid': '' , 'mid-mid': ''
     , 'right': '' , 'right-mid': ' ' , 'middle': '  ' },
     style: { 'padding-left': 0, 'padding-right': 0 }
  });

  trips.reverse();

  trips.forEach(trip => {
    let t = [];

    if (!hideRef) {
      let reference = trip.reference;
      t.push(reference);
    }

    // [TODO] Add hour?
    let departure_date = colors.green(moment(trip.departure_date).format('ddd, MMM D HH:mm'));
    let arrival_date = colors.green(moment(trip.arrival_date).format('ddd, MMM D HH:mm'));
    let date = departure_date;
    if (departure_date != arrival_date) {
      date += nl + arrival_date;
    }

    let stations = colors.bold(trip.departure_station.name + nl + trip.arrival_station.name);

    let passenger = trip.passenger.first_name;

    let price = {hAlign: 'right', content: colors.yellow(trip.cents/100 + ' ' + trip.currency)};

    t = t.concat([date, stations, passenger, price]);

    o.push({
      details: trip,
      short: trip.departure_station.name + ' > ' + trip.arrival_station.name + ' (' + passenger + ' - ' + price.content + ')'
    });
    table.push(t);
  });

  let stringTrips = table.toString().split(/\n\u001b\[90m \u001b\[39m\n/g);

  stringTrips.forEach((s, i) => {
    o[i].forDisplay = s;
  });

  return o;
}

/**
 * Create a table for display from an array of trips
 * @param {trips} array List of trips
 * @return string The table to display
 */
function tripsToTable(trips) {
  return tripsToArrayOfTables(trips).map(trip => { return trip.forDisplay }).join('\n');
}

/**
 * Helpers to display messages
 */
function displayInfo(message) {
  console.log(colors.blue(colors.bold('i ') + message));
}
function displaySuccess(message) {
  console.log(colors.yellow(colors.bold('✓ ') + message));
}
function displayError(message) {
  console.log(colors.red(colors.bold('x ') + message));
}

function s(n) {
  if (n >= 2) {
    return 's';
  }
  return '';
}

function startSpinner() {
  let spinner = new Spinner('%s');
  spinner.setSpinnerString(0);
  spinner.start();
  return spinner;
}
