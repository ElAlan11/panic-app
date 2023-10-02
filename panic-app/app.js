// Importación de modulos
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var helmet = require('helmet');
var sessions = require('express-session');
const mySQLStore = require('express-mysql-session')(sessions);

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var contactsRouter = require('./routes/contacts');
var incidentsRouter = require('./routes/incidents');

// const gconfigController = require('./controllers/globalconfig-controller');

// Establece las variables de entorno de .env si el entorno no es productivo
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const config = require('./config/config.json')[process.env.NODE_ENV];

// Se agregan los middleware a utilizar
var app = express();

app.use(logger('dev'));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


const sessionMaxAge = 1000 * 60 * 60 * 24 * 7; // La sesión expira en 24 horas
const sessionStore = new mySQLStore(config);

app.use(sessions({
  secret: process.env.SESSION_SECRET,
  saveUninitialized:false,
  resave: false,
  cookie: { maxAge: sessionMaxAge },
  store: sessionStore
}));

sessionStore.onReady().then(() => {
	// MySQL session store ready for use.
	console.log('MySQLStore ready');
}).catch(error => {
	// Something went wrong.
	console.error(error);
});


app.use('/', indexRouter);
app.use('/user', usersRouter);
app.use('/contact', contactsRouter);
app.use('/incident', incidentsRouter);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.json(err);
  // res.render('error');
});

module.exports = app;
