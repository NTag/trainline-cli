# Unofficial CLI client to book train tickets using trainline.eu

## Requirements
* NodeJS v7;
* NPM v3.

## Installation
```
npm install
```

## Usage
```
./index.js --login email@dress.com
./index.js --search
./index.js --basket
./index.js --trips
./index.js --logout
./index.js --help
```

Connection through Facebook, Google, or anonymous search are not supported yet.
Your password is not stored, but your connection token is, in `.node-persist/`.
