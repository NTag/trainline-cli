#!/usr/bin/env node

const program = require('commander');
const prompt = require('prompt');
const trainline = require('./trainline.js');
const colors = require('colors');

// Prompt global configuration
prompt.message = '';
prompt.delimiter = '';
prompt.colors = false;

program
  .version('1.0.0')
  .option('-l, --login [email]', 'Log in to your Trainline account')
  .option('-L, --logout', 'Logout of your Trainline account')
  .parse(process.argv);

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
      console.log(colors.blue('You are now connected as ' + infos.user.first_name + ' ' + infos.user.last_name + '!'));
      // Here we save the password
    }).catch(err => {
      console.log(colors.red('Wrong password or wrong email address'));
    });
  });
}
