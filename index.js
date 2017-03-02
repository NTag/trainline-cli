#!/usr/bin/env node

const trainline = require('./trainline.js');
const program = require('commander');
const prompt = require('prompt');
const storage = require('node-persist');
const colors = require('colors');

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
  }

  // Logout
  if (program.logout) {
    storage.removeItem('uinfos').then(() => {
      console.log('You are now disconnected');
    });
  }
}
