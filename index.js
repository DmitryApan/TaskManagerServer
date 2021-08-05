const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const WebSocket = require('ws');

const PORT = process.env.PORT || 5000
const HOST = process.env.HOST

const app = new express();

const cardSchema = new mongoose.Schema({
    description: String,
    status: String,
    title: String,
    owners: Array,
    children: Array,
});

const Card = mongoose.model('Card', cardSchema);

const userSchema = new mongoose.Schema({
    email: String,
    password: String,
    avatar: String,
    name: String,
});

const User = mongoose.model('User', userSchema);

const settingsSchema = new mongoose.Schema({
    statuses: Array,
    webSocket: Object,
});

const Settings = mongoose.model('Settings', settingsSchema);

app.set('trust proxy', 1)

app.use(cors({
    credentials: true,
	//origin: 'https://task-manager-by-b.herokuapp.com'
}));
app.use(express.json());

app.use(session({
    name: 'super-test',
    secret: 'secret',
    saveUninitialized: false,
    resave: false,
    cookie: {
        secure: true,
        sameSite: 'none',
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

mongoose.connect(connectionUri, {useNewUrlParser: true, useUnifiedTopology: true});

app.use(express.static(__dirname + '/build'));

app.get('/', function(request, response){
    response.sendFile(path.join(__dirname, 'build/index.html'));
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
    const { title, description, status } = request.body;

    if (title) {
        const card = new Card({ description, title, status: status || 'Open', owners: [] });

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
        Card.findByIdAndUpdate(id, request.body, {new: true}, (err, entity) => {
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

app.get('/users', (request, response) => {
    User.find((err, users) => {
        if (err) {
            response.json(err);
        } else {
            response.json(users);
        }
    });
});

app.put('/user', (request, response) => {
    const { email } = request.body;

    if (email) {
        const payload = { email };

        User.findOneAndUpdate(payload, request.body, {new: true}, (err, entity) => {
            if (err) {
                response.json(err);
            } else {
                response.json(entity);
            }
        });
    } else {
        response.json({err: 'where is email, dude?'});
    }
});

app.get('/settings', (request, response) => {
    Settings.find((err, settings) => {
        if (err) {
            response.json(err);
        } else {
            response.json(settings[0]);
        }
    });
});

app.put('/settings/:id', (request, response) => {
    const { id } = request.params;

    if (id) {
        Settings.findByIdAndUpdate(id, request.body, {new: true}, (err, entity) => {
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

const server = app.listen(PORT, function () {
    console.log(`Listening on ${PORT}`);
});

const wss = new WebSocket.Server({server});

const clients = {};
const watchDict = {
    CARDS: Card,
    USERS: User,
    SETTINGS: Settings,
};

Object.entries(watchDict)
    .forEach(([field, watchEntity]) => {
        watchEntity
            .watch()
            .on('change', () => {
                watchEntity.find((err, data) => {
                    if (!err) {
                        for (const key in clients) {
                            clients[key].send(JSON.stringify({
                                field,
                                data
                            }));

                            console.log("Send WS")
                        }
                    }
                });
            });
    });

wss.on('connection', function(ws) {
    const id = `${Date.now()} ${Math.random()}`;

    clients[id] = ws;

    console.log("Connect WS")

    ws.on('close', function() {
        delete clients[id];
    });
});
