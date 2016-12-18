### v4.2.4

* validate name length before uploading [#64](https://github.com/mapbox/mapbox-upload/pull/64)

### v4.2.3

* allow spaces in names [#61](https://github.com/mapbox/mapbox-upload/pull/61)

### v4.2.2

* add regular expression to catch invalid characters for the `name` option ([#58](https://github.com/mapbox/mapbox-upload/issues/58))
* README updates
* support for Node v4.x

### v4.2.1

* replace s3-upload-stream with aws-sdk for multi-part uploads [#52](https://github.com/mapbox/mapbox-upload/pull/52)
* update default API url

### v4.2.0

* ensure all uploads are never cached and always unique [#47](https://github.com/mapbox/mapbox-upload/pull/47)

### v4.1.0

* add `name` flag and validation to pass in a custom name for uploads/tilesets [#45](https://github.com/mapbox/mapbox-upload/pull/45)

### v4.0.0

* update output to `tileset` per Mapbox API changes

### v3.2.0

* no sudo in travis tests
* improved CLI docs
* use console.log instead of util.print
* update dependency versions: https://github.com/mapbox/mapbox-upload/commit/7d7c40f78054e39517abab1670a8bb9fbcf07273

### v3.1.0

* enable `patch` mode [#22](https://github.com/mapbox/mapbox-upload/pull/22)
* improved tests [#26](https://github.com/mapbox/mapbox-upload/pull/26)
* only use `MapboxAPI` in the executable

### v3.0.0

* create CLI tool [#17](https://github.com/mapbox/mapbox-upload/pull/170)

### v2.0.0

* rename `putmap` to `createupload` to be in sync with the uploads API url change from `api/Map` to `v1/uploads`
* update `createupload` to work with any s3 url, not just the returned url [#16](https://github.com/mapbox/mapbox-upload/pull/16)
* refactor errors to fix some race conditions [#15](https://github.com/mapbox/mapbox-upload/pull/15)
* update aws-sdk to `2.0.29`

### v1.1.4

* update request dependency to `2.48.x`

### v1.1.3

* updated API url to `api.mapbox.com`
* no federation tokens in tests [#11](https://github.com/mapbox/mapbox-upload/pull/11)

### v1.1.2

* fix an improper error call [#8](https://github.com/mapbox/mapbox-upload/pull/8)

### v1.1.1

* update s3-upload-stream dependency to `0.6.x`

### v1.1.0

* handle callback errors
* coordinate with Mapbox APIs [#6](https://github.com/mapbox/mapbox-upload/pull/6)

### v1.0.0

* return a progress-stream synchronously

### v0.0.3

* improved error handling and better error messages

### v0.0.2

* allow more success status codes
* add TravisCI integration

### v0.0.1

* first
