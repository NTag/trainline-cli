const request = require('request-promise');
const API = 'https://www.trainline.eu/api/v5/';

let trainline = {
  TOKEN: null
};

/**
 * Perform a request to the API
 * @param url string The URL of the resource
 * @param method string 'GET' or 'POST'
 * @param object The potential JSON body
 * @return Promise()
 */
function apiRequest(url, method, body) {
  let options = {
    method: method,
    uri: API + url,
    body: body,
    json: true // Automatically parses the JSON string in the response
  };
  if (trainline.TOKEN) {
    options.headers = {
      Authorization: 'Token token="' + trainline.TOKEN + '"'
    };
  }
  return request(options);
}

/**
 * Convert and array containing objects with an `id` field
 * to an object where the keys are the ids
 * @param arr Array
 * @return object
 */
function arrToObj(arr) {
  let o = {};
  arr.forEach(a => {
    o[a.id] = a;
  });
  return o;
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

/**
 * List of the user's trips
 * @return Promise([{arrival_date, departure_date, arrival_station, departure_station, cents}])
 */
trainline.trips = function() {
  return apiRequest('pnrs', 'GET').then(infos => {
    let stations = arrToObj(infos.stations);
    let passengers = arrToObj(infos.passengers);
    let folders = arrToObj(infos.folders);
    let pnrs = arrToObj(infos.pnrs);

    infos.trips.forEach(trip => {
      trip.arrival_station = stations[trip.arrival_station_id];
      trip.departure_station = stations[trip.departure_station_id];
      trip.passenger = passengers[trip.passenger_id];
      trip.reference = pnrs[folders[trip.folder_id].pnr_id].code;
    });

    // Only the booked trips
    let trips = infos.trips.filter(trip => {
      return pnrs[folders[trip.folder_id].pnr_id].booking_status == 'emitted';
    });

    return trips;
  });
};

module.exports = trainline;
