#!/usr/bin/env node

const trainline = require('./trainline.js');
const program = require('commander');
const prompt = require('prompt');
const storage = require('node-persist');
const colors = require('colors');
const moment = require('moment');
const Table = require('cli-table2');
const fuzzy = require('fuzzy');
const inquirer = require('inquirer');
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

// Connected user infos
var uinfos;

// Prompt global configuration
prompt.message = '';
prompt.delimiter = '';
prompt.colors = false;

// storage configuration
storage.init({
  stringify: JSON.stringify,
  parse: JSON.parse,
  encoding: 'utf8',
  ttl: false
}).then(() => {
  storage.getItem('uinfos').then(function(infos) {
    if (infos && infos.meta && infos.meta.token) {
      trainline.TOKEN = infos.meta.token;
      uinfos = infos;
      console.log(colors.yellow('Welcome ' + uinfos.user.first_name + ' ' + uinfos.user.last_name + '!'));
    }
    main();
  });
});

program
  .version('1.0.0')
  .option('-l, --login [email]', 'Log in to your Trainline account')
  .option('-L, --logout', 'Logout of your Trainline account')
  .option('-s, --search', 'Search for a trip')
  .option('-t, --trips', 'List of your trips')
  .option('-b, --basket', 'List of your options')
  .parse(process.argv);

function main() {
  // Login
  if (program.login) {
    prompt.start();
    prompt.get({
      properties: {
        password: {
          hidden: true,
          description: "Trainline password:"
        }
      }
    }, function (err, result) {
      if (err || !result || !result.password) {
        console.log('Please enter your password');
        return;
      }
      trainline.connexion(program.login, result.password).then(infos => {
        uinfos = infos;
        return storage.setItem('uinfos', infos);
      }).then(() => {
        console.log(colors.blue('You are now connected as ' + uinfos.user.first_name + ' ' + uinfos.user.last_name + '!'));
      }).catch(err => {
        console.log(colors.red('Wrong password or wrong email address'));
      });
    });
    return;
  }

  // The following actions need a user to be connected
  if (!uinfos) {
    console.log('You are not connected. Use --login [email]');
    return;
  }

  // Logout
  if (program.logout) {
    storage.removeItem('uinfos').then(() => {
      console.log('You are now disconnected');
    });
  }

  if (program.trips) {
    console.log('List of your trips');
    trainline.trips().then(trips => {
      console.log(tripsToTable(trips.slice(0, 7)));
    });
  }

  if (program.basket) {
    console.log('Content of your basket');
    trainline.basket().then(trips => {
      console.log(tripsToTable(trips));
    });
  }

  if (program.search) {
    let dates = getNextDays(90);

    inquirer.prompt([
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
        message: 'When:',
        source: (answers, input) => {
          return Promise.resolve(fuzzy.filter(input || '', dates).map(e => { return e.string }));
        },
        pageSize: 5
      },
      {
        type: 'checkbox',
        name: 'passengers',
        message: 'Passengers:',
        choices: uinfos.passengers.map(passenger => {
          return {
            checked: passenger.is_selected,
            name: passenger.first_name + ' ' + passenger.last_name
          }
        }).sort((a, b) => {
          return a.checked;
        })
      }
    ]).then(answers => {
      console.log(JSON.stringify(answers, null, 2));
    });
  }
}

/**
 * Return the next `limit` days, to a human format
 * @param limit number The number of days to return
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
 * @param answers The previous answers
 * @param input string The query
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
 * Create a table for display from an array of trips
 * @param trips array List of trips
 * @return string The table to display
 */
function tripsToTable(trips) {
  let table = new Table({
    style: { 'padding-left': 0 }
  });

  trips.forEach(trip => {
    let reference = trip.reference;

    let departure_date = moment(trip.departure_date).calendar();
    let arrival_date = moment(trip.arrival_date).calendar();
    let date = departure_date;
    if (departure_date != arrival_date) {
      date += '\n' + arrival_date;
    }

    let stations = trip.departure_station.name + '\n' + trip.arrival_station.name;

    let passenger = trip.passenger.first_name;

    let price = {hAlign: 'right', content: trip.cents/100 + ' ' + trip.currency};

    table.push([reference, date, stations, passenger, price]);
  });

  return table.toString();
}
