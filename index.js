#!/usr/bin/env node

const trainline = require('./trainline.js');
const program = require('commander');
const prompt = require('prompt');
const storage = require('node-persist');
const colors = require('colors');
const moment = require('moment');
const Table = require('cli-table2');

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
  .option('-t, --trips', 'List of your trips')
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
      let table = new Table({
        style: { 'padding-left': 0 }
      });

      trips.slice(0, 7).forEach(trip => {
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

      console.log(table.toString());
    });
  }
}
