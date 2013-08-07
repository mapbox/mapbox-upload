// This policy allows upload to a single key in a testing bucket.
// All keys are removed from this object daily via a lifecycle rule.
module.exports = {
    bucket: 'mapbox-upload-testing',
    AWSAccessKeyId: 'AKIAIR36XSPJU7ZTK5MQ',
    acl: 'public-read',
    key: '_pending/test/badad68cc541a9b339565c1eb74d28cf',
    policy: 'eyJleHBpcmF0aW9uIjoiMjAyMy0wOC0wNVQyMDoyOTowNC44MjFaIiwiY29uZGl0aW9ucyI6W3siYnVja2V0IjoibWFwYm94LXVwbG9hZC10ZXN0aW5nIn0seyJhY2wiOiJwdWJsaWMtcmVhZCJ9LHsia2V5IjoiX3BlbmRpbmcvdGVzdC9iYWRhZDY4Y2M1NDFhOWIzMzk1NjVjMWViNzRkMjhjZiJ9LHsic3VjY2Vzc19hY3Rpb25fcmVkaXJlY3QiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAvdGVzdC9jcmVhdGUvYmFkYWQ2OGNjNTQxYTliMzM5NTY1YzFlYjc0ZDI4Y2YifV19',
    signature: 'gLMlmBh5+ATlX5fjHHi/Hw5VPcA=',
    success_action_redirect: 'http://localhost:3000/test/create/badad68cc541a9b339565c1eb74d28cf',
    filename: '.mbtiles|.tilejson$'
};
