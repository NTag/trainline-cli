'use strict';

const request = require('request-promise');
const API = 'https://www.trainline.eu/api/v5/';

let trainline = {
  TOKEN: null,
  USER_ID: null
};

/**
 * Perform a request to the API
 * @param {url} string The URL of the resource
 * @param {method} string 'GET', 'POST' or 'PUT'
 * @param {body} object The potential JSON body
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
 * @param {arr} Array
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
      trip.pnr_id = folders[trip.folder_id].pnr_id;
      trip.is_selected = pnrs[folders[trip.folder_id].pnr_id].is_selected;
    });

    return infos;
  });
}

/**
 * Return the booked or emitted trips
 * @param {status} string 'booked' or 'emitted'
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
 * @param {email} string
 * @param {password} string
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
 * @param {query} string The query
 * @return Promise([{id, name}])
 */
trainline.searchStation = function(query) {
  return apiRequest('stations?context=search&q=' + encodeURI(query)).then(o => o.stations);
};

/**
 * Search for trips
 * @param {departure_station_id} string The id of the departure station
 * @param {arrival_station_id} string The id of the arrival station
 * @param {passenger_ids} array The ids of the passengers
 * @param {card_ids} array The ids of the cards
 * @param {departure_date} string The departure date
 * @return array({})
 */
trainline.searchTrips = function(departure_station_id, arrival_station_id, passenger_ids, card_ids, departure_date) {
  let flexibility = 'nonflexi';
  let body = {
    search: {
      arrival_station_id: arrival_station_id,
      departure_date: departure_date,
      departure_station_id: departure_station_id,
      passenger_ids: passenger_ids,
      card_ids: card_ids,
      systems: ["sncf", "db", "busbud", "idtgv", "ouigo", "trenitalia", "ntv", "hkx", "renfe", "benerail", "ocebo", "timetable"]
    }
  };
  return apiRequest('search', 'POST', body).then(result => {
    let stations = arrToObj(result.stations);
    let passengers = arrToObj(result.passengers);
    let folders = arrToObj(result.folders);
    let segments = arrToObj(result.segments);

    let trips = {};
    let atrips = [];
    result.trips.forEach(trip => {
      // To keep it simple, we only keep the trips with the flixibility `flexibility`
      let folder = folders[trip.folder_id];
      if (folder.flexibility != flexibility) {
        return;
      }

      let t = trips[trip.digest];
      if (!t) {
        t = {
          departure_station: stations[trip.departure_station_id].name,
          arrival_station: stations[trip.arrival_station_id].name,
          departure_date: trip.departure_date,
          arrival_date: trip.arrival_date,
          segments: [],
          travel_classes: {}
        };

        trip.segment_ids.forEach(segment => {
          let s = segments[segment];
          t.segments.push({
            departure_station: stations[s.departure_station_id].name,
            arrival_station: stations[s.arrival_station_id].name,
            departure_date: s.departure_date,
            arrival_date: s.arrival_date,
            train_name: s.train_name
          });
        });

        trips[trip.digest] = t;
        atrips.push(t);
      }

      t.travel_classes[folder.travel_class] = {
        cents: trip.cents,
        currency: trip.currency,
        tobook: {
          search_id: result.search.id,
          folder_id: folder.id
        }
      };
    });

    return atrips;
  });
};

/**
 * Book a trip to the basket
 * @param {search_id} string ID of the search
 * @param {folder_id} string ID of the folder
 * @return Promise
 */
trainline.bookTrip = function(search_id, folder_id) {
  return apiRequest('book', 'POST', {
    book: {
      search_id: search_id,
      outward_folder_id: folder_id
    }
  });
};

/**
 * (Un)Select a pnr in the basket
 * @param {pnr_id} string ID of the pnr
 * @param {is_selected} boolean New status of the pnr
 * @return Promise
 */
trainline.selectPnr = function(pnr_id, is_selected) {
  return apiRequest('pnrs/' + pnr_id, 'PUT', {
    pnr: {
      is_selected: is_selected,
      booker_id: trainline.USER_ID,
      inquiry_id: null
    }
  });
};

/**
 * Return the payment cards registered
 * @return Promise
 */
trainline.paymentCards = function() {
  return apiRequest('payment_cards');
};

/**
 * Pay for pnrs. This method computes the total price to pay, creates and
 * confirm the payment.
 * @param {payment_card_id} string ID of the credit card
 * @param {cvv} string The security code of the credit card
 * @param {pnrs} array({}) Pnrs to buy
 * @return Promise
 */
trainline.payForPnrs = function(payment_card_id, cvv, pnrs) {
  if (pnrs.length == 0) {
    return Promise.resolve();
  }

  let totalPrice = pnrs.reduce((acc, pnr) => { return acc + pnr.cents }, 0);
  let currency = pnrs[0].currency;
  let pnr_ids = pnrs.map(pnr => { return pnr.pnr_id });

  let body = {
    payment: {
      cents: totalPrice,
      currency: currency,
      mean: "payment_card",
      payment_card_id: payment_card_id,
      cvv_code: cvv,
      pnr_ids: pnr_ids
    }
  };

  return apiRequest('payments', 'POST', body).then(payment => {
    let paymentId = payment.payment.id;

    return apiRequest('payments/' + paymentId + '/confirm', 'POST', body);
  });
};

module.exports = trainline;
