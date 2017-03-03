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
 * Retrieve complete trips, folders information
 * @return Promise()
 */
function getPnrs() {
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
      trip.booking_status = pnrs[folders[trip.folder_id].pnr_id].booking_status;
    });

    return infos;
  });
}

/**
 * Return the booked or emitted trips
 * @param status string 'booked' or 'emitted'
 * @return Promise([{arrival_date, departure_date, arrival_station, departure_station, cents}])
 */
function tripsWithBookingStatus(status) {
  return getPnrs().then(infos => {
    let trips = infos.trips.filter(trip => {
      return trip.booking_status == status;
    });

    return trips;
  });
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
 * List of the user's emitted trips
 * @return Promise([{arrival_date, departure_date, arrival_station, departure_station, cents}])
 */
trainline.trips = function() {
  return tripsWithBookingStatus('emitted');
};

/**
 * User's basket (list of booked trips)
 * @return Promise([{arrival_date, departure_date, arrival_station, departure_station, cents}])
 */
trainline.basket = function() {
  return tripsWithBookingStatus('booked');
};

/**
 * Search for a station
 * @param query string The query
 * @return Promise([{id, name}])
 */
trainline.searchStation = function(query) {
  return apiRequest('stations?context=search&q=' + encodeURI(query)).then(o => o.stations);
};

/**
 * Search for trips
 * @param departure_station_id string The id of the departure station
 * @param arrival_station_id string The id of the arrival station
 * @param passenger_ids array(string) The ids of the passengers
 * @param departure_date string The departure date
 * @return array({})
 */
trainline.searchTrips = function(departure_station_id, arrival_station_id, passenger_ids, departure_date) {
  let body = {
    search: {
      arrival_station_id: arrival_station_id,
      departure_date: departure_date,
      departure_station_id: departure_station_id,
      passenger_ids: passenger_ids,
      systems: ["sncf", "db", "busbud", "idtgv", "ouigo", "trenitalia", "ntv", "hkx", "renfe", "benerail", "ocebo", "timetable"]
    }
  };
  return apiRequest('search', 'POST', body);
};

module.exports = trainline;
