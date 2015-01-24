![travis](https://travis-ci.org/mapbox/mapbox-upload.svg)

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

```
$ curl https://api.tiles.mapbox.com/uploads/v1/<your mapbox username>?access_token=<your access token>
```

If the request is successful, the token is working.

## Install

```
npm install --save mapbox-upload
```

## CLI Usage

See [USAGE.txt](https://github.com/mapbox/mapbox-upload/blob/cli/USAGE.txt)

## JavaScript Usage

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

progress.once('finished', function(){
	// Upload has completed but is likely queued for processing and not yet available on Mapbox.
});

```


### Options

#### stream
A [`stream`](http://nodejs.org/api/stream.html) object can be passed in instead of `{file: filepath}`.
`length` option is recommended for accurate progress-stream reporting. If length is unknown, it can be updated after upload has begun by emitting a `length` event from the `stream` object.

## Tests

```
npm test
```

tests require env variables `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to generate test credentials
