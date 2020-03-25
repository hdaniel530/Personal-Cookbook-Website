// db.js
const mongoose = require('mongoose');
const URLSlugs = require('mongoose-url-slugs');
const bycrypt = require('bcrypt-nodejs');

// 1ST DRAFT DATA MODEL

// users
// * site requires authentication...
// * so users have a username and password
const User = new mongoose.Schema({
  // username provided by authentication plugin
  // password hash provided by authentication plugin and bcrypt for hashing
  username: {type: String, required: true, unique: true},
  password: {type: String, required: true},

});

User.methods.generateHash = function(password) {
	return bycrypt.hashSync(password, bycrypt.genSaltSync(8), null);
};

User.methods.validPassword = function(password) {
	return bycrypt.compareSync(password, this.password);
};

// a cookbook is owned by a user
// * includes the title, icon and tags of this cookbook
const CookbookSchema = new mongoose.Schema({
  creator: {type: mongoose.Schema.Types.ObjectId, ref:'User', required: true},
  title: {type: String, required: true},
  tags: [String],
  icon: Object //image
});

// a recipe is owned by a user and is part of many cookbooks
// * each recipe must have a related user and name, steps, ingredients(check in app.js), prepTime and serving size
// * can record tags and supplies
const Recipe = new mongoose.Schema({
  creator: {type: mongoose.Schema.Types.ObjectId, ref:'User', required: true},
  name: {type: String, required: true},
  tags: [String],
  prepTime: {type: String, required: true},
  servingSize: {type: Number, required: true, min:1},
  ingredients: [String],
  supplies: [String],
  steps: [String],
  icon: Object, //GridFs image
  cookbooks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Cookbook' }]
});

// an image object is owned by a user
// * each image must have a related user, image and caption
const Image = new mongoose.Schema({
  creator: {type: mongoose.Schema.Types.ObjectId, ref:'User', required: true},
  caption: {type: String, required: true},
  icon: {type: Object, required: true}//GridFs image
});



// TODO: add remainder of setup for slugs, connection, registering models, etc. below
CookbookSchema.plugin(URLSlugs('creator.username title'));
Recipe.plugin(URLSlugs('creator.username name'));


// register models
mongoose.model('Cookbook', CookbookSchema);
mongoose.model('Recipe', Recipe);
mongoose.model('Image', Image);
mongoose.model('User', User);


//is the environment variable, NODE_ENV, set to PRODUCTION?
let dbconf;
if (process.env.NODE_ENV === 'PRODUCTION') {
 // if we're in PRODUCTION mode, then read the configration from a file
 // use blocking file io to do this...
 const fs = require('fs');
 const path = require('path');
 const fn = path.join(__dirname, 'config.json');
 const data = fs.readFileSync(fn);

 // our configuration file will be in json, so parse it and set the
 // conenction string appropriately!
 const conf = JSON.parse(data);
 dbconf = conf.dbconf;
}
else {
 // if we're not in PRODUCTION mode, then use
 dbconf = 'mongodb://localhost/cookbooks';
}

mongoose.connect(dbconf,{useNewUrlParser: true}, (err) => {
  console.log('createConnection callback, readyState is', mongoose.connection.readyState);
  console.log('err object is', err);
});
const conn = mongoose.connection;
//export connection and configuration
module.exports = {conn, dbconf};
