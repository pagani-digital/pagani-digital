require('dotenv').config();
var pg = require('pg');
var pool = new pg.Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

Promise.all([
  pool.query('SELECT * FROM posts WHERE comments IS NOT NULL AND jsonb_array_length(comments)>0 LIMIT 3'),
  pool.query('SELECT id, avatar_photo FROM users')
]).then(function(results) {
  var postsRes = results[0];
  var usersRes = results[1];
  var photoMap = {};
  for (var u of usersRes.rows) photoMap[u.id] = u.avatar_photo || '';
  console.log('photoMap keys:', Object.keys(photoMap), 'types:', Object.keys(photoMap).map(k => typeof k));

  postsRes.rows.forEach(function(p) {
    var comments = p.comments || [];
    comments.forEach(function(c) {
      var key = c.authorId;
      var found = photoMap[key];
      console.log('post:'+p.id+' authorId='+key+' (type:'+typeof key+') photoMap[key] len='+(found?found.length:'UNDEFINED'));
    });
  });
  pool.end();
}).catch(function(e) { console.log('ERR:', e.message); pool.end(); });
