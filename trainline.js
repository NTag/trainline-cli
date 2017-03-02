const request = require('request-promise');
const API = 'https://www.trainline.eu/api/v5/';

let trainline = {
  TOKEN: null
};

function apiRequest(url, method, body) {
  let options = {
    method: method,
    uri: API + url,
    // qs: {
    //     access_token: 'xxxxx xxxxx' // -> uri + '?access_token=xxxxx%20xxxxx'
    // },
    // headers: {
    //     'User-Agent': 'Request-Promise'
    // },
    body: body,
    json: true // Automatically parses the JSON string in the response
  };
  return request(options);
}

/**
 * Try to connect the user with email and password
 * @param email string
 * @param password string
 * @return Promise(infos)
 */
trainline.connexion = function (email, password) {
  return apiRequest('account/signin', 'POST', {
    email: email,
    password: password
  }).then(infos => {
    return infos;
  });
};

module.exports = trainline;
