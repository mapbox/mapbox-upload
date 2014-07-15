mapbox-upload
-------------
Library for interfacing with the Mapbox upload API.

## Disclaimer

This software uses a private Mapbox API so:

- Be sure know what you are doing
- Contact support@mapbox.com before using it
- Don't use for mission critical applications

## Authentication

A Mapbox API token is required for authentication. Generate a **secret** token
with the **map write** scope enabled by following
[these steps](https://www.mapbox.com/help/create-api-access-token/). You can
test the token by making a request like:

    https://api.mapbox.com/api/upload/<your mapbox username>?access_token=<your access token>

If the request is successful, the token is working.

## Install

```
npm install --save mapbox-upload
```

## Usage

```javascript
var upload = require('mapbox-upload');

// creates a progress-stream object to track status of
// upload while upload continues in background
var progress = upload({
    file: __dirname + '/test.mbtiles', // Path to mbtiles file on disk.
    account: 'test', // Mapbox user account.
    accesstoken: 'validtoken', // A valid Mapbox API secret token with the map:write scope enabled.
    mapid: 'test.upload' // The identifier of the map to create or update.
});

progress.on('error', function(err){
	if (err) throw err;
});

progress.on('progress', function(p){
	// Do something with progress-stream object, like display upload status
});

progress.once('end', function(){
	// Upload has completed but is likely queued for processing and not yet available on Mapbox.
});

```

## Tests

```
npm test
```
