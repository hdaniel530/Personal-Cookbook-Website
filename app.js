//retrieve database connection and details from db.js
const {conn, dbconf} = require('./db.js');
const mongoose = require('mongoose');
const Cookbook = mongoose.model('Cookbook');
const Recipe = mongoose.model('Recipe');
const Image = mongoose.model('Image');
const User = mongoose.model('User');
const ObjectId = require('mongodb').ObjectID;

const sanitize = require('mongo-sanitize');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');

const GridFsStorage = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');

const express = require('express');
const path = require('path');
const multer = require('multer');

const passport = require('passport');
const Strategy = require('passport-local').Strategy;

const app = express();

// enable sessions
const session = require('express-session');
const sessionOptions = {
    secret: 'secret cookie',
    resave: true,
    saveUninitialized: true
};
//session parsers and handlers
app.use(session(sessionOptions));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(flash());

//Passport-User authentication and registration
//initialize and set session
app.use(passport.initialize());
app.use(passport.session());

//add and remove user from session
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});
//login authentication
passport.use('local-login',new Strategy({
  usernameField: 'username',
	passwordField: 'password',
  passReqToCallBack: true
},
  function(username, password, done) {
    User.findOne({ username: username }, function(err, user) {
      if (err) {
        return done(err);
      }
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      if (!user.validPassword(password)) {
        return done(null, false, { message: 'Incorrect password.' });
      }
      return done(null, user);
    });
  }
));
//registration
passport.use('local-register', new Strategy({
  usernameField: 'username',
	passwordField: 'password',
  passReqToCallBack: true
},
		function (username, password, done) {
			process.nextTick(function(){
				User.findOne({username: username}, function(err, user) {
					if (err){
						return done(err);
          }
					else if (user){
						return done(null, false, {message: 'That user is already taken.'});
          }
					else {
						const newUser = new User({
              username: username
            });
						newUser.password = newUser.generateHash(password);
						newUser.save(function(err) {
							if (err) {
								throw err;
							}
							return done(null, newUser);
						});
					}
				});
			});
}));

//check if user is logged in, added into routes to be accessed when authenticated
function loggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/');
}


// serve static files
app.use(express.static(path.join(__dirname, 'public')));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

// body parser setup
app.use(express.urlencoded({extended: false}));



//GridFS initialization
let gfs;
//create Grid object once database is connected
conn.once('open', () => {
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection('images');
});

const storage = new GridFsStorage({
  url: dbconf,
  file: (req, file) => {
    return new Promise((fulfill) => {
        const filename = file.originalname;
        const fileInfo = {
          filename: filename,
          bucketName: 'images'
        };
        fulfill(fileInfo);
    });
  }
});
//Multer storage set
const upload = multer({ storage: storage });

//Route handlers
app.get('/', (req, res) => {
  res.render('index');
});
//register route
app.post('/register', passport.authenticate('local-register', {
  successRedirect: '/home',
  failureRedirect: '/registerFailed',
}));
//failed register route
app.get('/registerFailed',(req, res) => {
  //Show error
  const error = "Failed register :( !";
  res.render('index', {error});
});

//login route
app.post('/login', passport.authenticate('local-login', {
  successRedirect: '/home',
  failureRedirect: '/loginFailed'
}));
//failed login route
app.get('/loginFailed',(req, res) => {
  //Show error
  const error = "Failed login :( !";
  res.render('index', {error});
});

//logout user
app.get('/logout', function(req, res) {
  req.logOut();
  res.redirect('/');
});

//user home page, shows all user-created cookbooks
app.get('/home', loggedIn, (req, res) => {
  const cbs = [];
  Cookbook.find({creator: req.user},(error, cookbooks) =>{
    if(error){
      res.status(404).send("Not found");
    }
    else{
      cookbooks.map((book) =>{
        const cookbook = {};
        cookbook['title'] = book.title;
        if(book.tags.length !== 0){
          cookbook['tags'] = book.tags;
        }
        cookbook['slug'] = book.slug;
        cookbook['icon'] = book.icon;
        cbs.push(cookbook);
      });
      res.render('home', {cookbooks: cbs});
    }
  });
});

//retrieve image
app.get('/image/:id', loggedIn, (req, res) => {
  gfs.files.findOne({_id: ObjectId(req.params.id)}, (err, file) => {
    if (!file || file.length === 0) {
      return res.status(404).json({err: 'No file exists'});
    }
    else {
      const readstream = gfs.createReadStream(file._id);
      return readstream.pipe(res);
    }
  });
});

//create cookbook form
app.get('/cookbook/create', loggedIn, (req, res) => {
  res.render('cookbook');
});
//save cookbook into database (upload.single-saves image), show error otherwise
app.post('/cookbook/create', loggedIn, upload.single('cookbookicon'), (req, res) => {
  const title = sanitize(req.body.title);
  let tags;
  if(req.body.tags){
    tags = sanitize(req.body.tags).split(",");
    tags = tags.map(elem=>elem.trim());
  }
  else{
    tags = [];
  }
  //if image exists
  if(req.file){
    const newCookbook = new Cookbook({
      creator: req.user,
      title: title,
      tags: tags,
      icon: req.file
    });
    newCookbook.save((err) => {
      if(err){
        const error = "Could not add cookbook!";
        res.render('cookbook', {error});
      }
      else{
        res.redirect('/home');
      }
    });
  }
  else{
    const newCookbook = new Cookbook({
      creator: req.user,
      title: title,
      tags: tags
    });
    newCookbook.save((err) => {
      if(err){
        const error = "Could not add cookbook!";
        res.render('cookbook', {error});
      }
      else{
        res.redirect('/home');
      }
    });
  }
});
//display cookbook details such as recipes and form to add recipe to that cookbook
app.get('/cookbook/:slug', loggedIn, (req, res) => {
  Cookbook.findOne({slug: req.params.slug}, (error,cookbook)=>{
    if(error){
      res.status(404).send("Not found");
    }
    else{
      const cb = {};
      cb['title'] = cookbook.title;
      if(cookbook.tags.length !== 0){
        cb['tags'] = cookbook.tags;
      }
      cb['slug'] = cookbook.slug;
      cb['icon'] = cookbook.icon;
      Recipe.find({cookbooks: ObjectId(cookbook._id)}, (error, recipes)=>{
        if(error){
          res.status(404).send("Not found");
        }
        else{
          Recipe.find((error,allrecipes)=>{
            if(error){
              res.status(404).send("Not found");
            }
            else{
              res.render('cookbook-slug', {cookbook: cb, recipes, allrecipes});
            }
          });
        }
      });
    }
  });
});

//save cookbook into recipe schema in database if not there
app.post('/cookbook/:slug', loggedIn, (req,res)=>{
  const recipeSlug = sanitize(req.body.recipeSlug);
  Cookbook.findOne({slug: req.params.slug}, (error,cookbook)=>{
    if(error){
      res.status(404).send("Not found");
    }
    else{
      Recipe.find({slug: recipeSlug, cookbooks: ObjectId(cookbook._id)}, (error, recipe)=>{
        if(error || recipe.length > 0){
          res.redirect("/cookbook/"+req.params.slug);
        }
        else{
          Recipe.findOneAndUpdate({slug: recipeSlug}, {$push: {cookbooks: cookbook}}, ()=>{
              res.redirect("/cookbook/"+req.params.slug);
          });
        }
      });
    }
  });
});

//create recipe form
app.get('/recipe/create', loggedIn, (req, res) => {
  res.render('recipe');
});
//save recipe into database, show error otherwise
app.post('/recipe/create', loggedIn, upload.single('recipeicon'), (req, res) => {
  const name = sanitize(req.body.name).trim();
  let tags;
  if(req.body.tags){
    tags = sanitize(req.body.tags).split(",");
    tags = tags.map(elem=>elem.trim());
  }
  else{
    tags = [];
  }
  let supplies;
  if(req.body.supplies){
    supplies = sanitize(req.body.supplies).split(",");
  }
  else{
    supplies = ["None"];
  }
  const prepTime = sanitize(req.body.preptime);
  const servingSize = parseInt(sanitize(req.body.servingsize));
  //check if user provided ingredients, steps, valid servingSize, if not show error
  if(!(req.body.ingredients && req.body.steps && !isNaN(servingSize))){
    const error = "Could not add recipe :(!";
    res.render('recipe',{error});
  }
  else{
    const ingredients = sanitize(req.body.ingredients).split(",");
    const steps = sanitize(req.body.steps).split("\r\n");
    //if image exists, save image
    if(req.file){
      const newRecipe = new Recipe({
        creator: req.user,
        name: name,
        tags: tags,
        prepTime: prepTime,
        servingSize: servingSize,
        ingredients: ingredients,
        supplies: supplies,
        steps: steps,
        icon: req.file
      });
      newRecipe.save((err)=>{
        if(err){
          const error = "Could not add recipe!";
          res.render('recipe', {error});
        }
        else{
          res.redirect('/myrecipes');
        }
      });
    }
    else{
      const newRecipe = new Recipe({
        creator: req.user,
        name: name,
        tags: tags,
        prepTime: prepTime,
        servingSize: servingSize,
        ingredients: ingredients,
        supplies: supplies,
        steps: steps
      });
      newRecipe.save((err)=>{
        if(err){
          const error = "Could not add recipe!";
          res.render('recipe', {error});
        }
        else{
          res.redirect('/myrecipes');
        }
      });
    }
  }
});
//get all of the user-created recipes
app.get('/myrecipes', loggedIn, (req, res) => {
  Recipe.find({creator: req.user}, (error, recipes) =>{
    if(error){
      res.status(404).send("Not found");
    }
    else{
      res.render('myrecipe', {recipes: recipes});
    }
  });
});
//search by tag result page or if specific tag button was clicked
app.get('/search', loggedIn, (req,res)=>{
  const items = [];
  const tag = sanitize(req.query.search);
  if(tag === ''){
    res.render('search', {items: items});
  }
  else{
    Cookbook.find({tags: tag}, (err,cookbooks) =>{
      if(err){
        res.status(404).send("Not found");
      }
      else{
        cookbooks.map((book) =>{
          const cookbook = {};
          cookbook['title'] = book.title;
          cookbook['tags'] = book.tags;
          cookbook['icon'] = book.icon;
          cookbook['cookbook'] = true;
          items.push(cookbook);

        });
        Recipe.find({tags: tag}, (err,recipes) =>{
          if(err){
            res.status(404).send("Not found");
          }
          else{
            recipes.map((book) =>{
              const recipe = {};
              recipe['title'] = book.name;
              recipe['tags'] = book.tags;
              recipe['icon'] = book.icon;
              recipe['recipe'] = true;
              items.push(recipe);
            });
            res.render('search', {items: items});
          }
        });
      }
    });
  }
});
//shows user-uploaded images and form to add more images/food creations
app.get('/mygallery', loggedIn, (req,res)=>{
  Image.find({creator: req.user},(error, images) =>{
    if(error){
      res.status(404).send("Not found");
    }
    else{
      res.render('mygallery', {images: images});
    }
  });
});
//saves image, shows error if error occurred
app.post('/mygallery', loggedIn, upload.single("galleryimages"), (req,res) => {
  const newImage = new Image({
    creator: req.user,
    caption: sanitize(req.body.caption),
    icon: req.file
  });
  newImage.save((err)=>{
    if(err){
      Image.find((error, images) =>{
        if(error){
          res.status(404).send("Not found");
        }
        else{
          const error = "Could not add image!";
          res.render('mygallery', {images: images, error});
        }
      });
    }
    else{
      res.redirect('/mygallery');
    }
  });
});

app.listen(process.env.PORT || 3000);
