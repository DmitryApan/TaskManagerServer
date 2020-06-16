const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const PORT = process.env.PORT || 8888;

const app = new express();

const cardSchema = new mongoose.Schema({
    description: String,
    status: String,
    title: String,
});

const Card = mongoose.model('Card', cardSchema);

const userSchema = new mongoose.Schema({
    email: String,
    password: String,
    avatar: String,
    name: String,
});

const User = mongoose.model('User', userSchema);

app.use(cors());
app.use(express.json());

app.use(session({
    name: 'super-test',
    secret: 'secret',
    saveUninitialized: false,
    resave: false,
    cookie: {
        secure: false,
        sameSite: 'lax',
        httpOnly: true,
    }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, next) => {
    next(null, user);
});

passport.deserializeUser((req, body, next) => {
    User.findOne(body, (err, user) => {
        next(null, user);
    });
});

const local = new LocalStrategy(
    {
        usernameField: 'email',
        passwordField: 'password',
        session: true,
        passReqToCallback: true,
    },
    function (req, email, password, done) {
        User.findOne({ email }, (err, user) => {
            if (!user || user.password !== password) {
                return done(null, false, {
                    message: 'Wrong email or password'
                });
            } else {
                return done(null, user);
            }
        });
    }
);

passport.use(local);

app.post('/login',
    passport.authenticate('local'),
    (req, res) => {
        res.json(req.user);
    }
);

app.get('/logout', function(req, res){
    req.logout();
    res.json({ok: true});
});

mongoose.set('useFindAndModify', false);

const connectionUri = 'mongodb+srv://admin:admin@cluster0-tjm8e.mongodb.net/test?retryWrites=true&w=majority';

mongoose.connect(connectionUri, {useNewUrlParser: true});

app.get('/', function(request, response){
    response.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/register', (request, response) => {
    const { email, password } = request.body;

    if (email && password) {
        const user = new User({ email, password });

        user.save((err, entity) => {
            if (err) {
                response.json(err);
            } else {
                response.json(entity);
            }
        });
    } else {
        response.json({err: 'you need to pass email and password'});
    }
});

const authMiddleware = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }

    res.json({redirectToLogin: true, ok: false});
};

app.get('/cards', (request, response) => {
    Card.find((err, cards) => {
        if (err) {
            response.json(err);
        } else {
            response.json(cards);
        }
    });
});

app.post('/card', (request, response) => {
    const { title, description } = request.body;

    if (title) {
        const card = new Card({ description, title, status: 'Open' });

        card.save((err, entity) => {
            if (err) {
                response.json(err);
            } else {
                response.json(entity);
            }
        });
    } else {
        response.json({err: 'where is title, dude?'});
    }
});

app.put('/card/:id', (request, response) => {
    const { id } = request.params;

    if (id) {
        Card.findByIdAndUpdate(id, request.body, (err, entity) => {
            if (err) {
                response.json(err);
            } else {
                response.json(entity);
            }
        });
    } else {
        response.json({err: 'where is id, dude?'});
    }
});

app.delete('/card/:id', (request, response) => {
    const { id } = request.params;

    if (id) {
        Card.findByIdAndRemove(id, (err, entity) => {
            if (err) {
                response.json(err);
            } else {
                response.json(entity);
            }
        });
    } else {
        response.json({err: 'where is id, dude?'});
    }
});

app.get('/settings', (request, response) => {
    response.json(['Open', 'In Progress', 'Closed']);
});

app.listen(PORT, function () {
    console.log(`Listening on ${PORT}`);
});
