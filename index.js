const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const redisStorage = require('connect-redis')(session)
const redis = require('redis')
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

const client = redis.createClient({
	host: 'redis-12791.c92.us-east-1-3.ec2.cloud.redislabs.com',
	port: 12791,
	password: '2ggRuP6nhhC1hygn5EEa6hz0DtlIoiqR'
})
client.on('error', err => {
    console.log('Error redis: ' + err);
})

app.set('trust proxy', 1)

app.use(cors({
    credentials: true,
	//origin: 'https://task-manager-by-b.herokuapp.com'
    origin: 'http://localhost:3000'
}));
app.use(express.json());
app.use(express.urlencoded({extended: true}))
app.use(session({
    store: new redisStorage({client}),
    secret: 'hgkhgsd5fs351fs53fd1s',
    saveUninitialized: false,
    rolling: true,
    resave: true,
    cookie: {
        secure: true,
        sameSite: 'none',
    }
}));

app.use(passport.initialize());
app.use(passport.session());

const local = new LocalStrategy(
    {
        usernameField: 'email',
        passwordField: 'password',
    },
    function (email, password, done) {
        User.findOne({ email }, (err, user) => {
            if (err) { return done(err); }
            if (!user || user.password !== password) {                
                return done(null, false, { message: 'Wrong email or password' });
            } else {
                return done(null, user);
            }
        });
    }
);
passport.use(local);
passport.serializeUser((user, next) => {
    next(null, user);
    console.log('Serialize user: ' + user);
});
passport.deserializeUser((user, next) => {
    next(null, user);
    console.log('Deserialize user: ' + user);
});

app.post('/login', function (req, res) {
    passport.authenticate('local', function (err, user, info) {
		if (err) {
			return res.send(err);
		}

		if (!user) {
			return res.send(info.message)
		}

		req.logIn(user, function (err) {
			if (err) {
				return res.send(err);
			}
			
			if (req.body.rememberMe) {
				req.session.cookie.expires = true
				req.session.cookie.maxAge = 180 * 24 * 60 * 60 * 1000
				req.session.save()
			}

            console.log('LogIn: ' + user);

			return res.send(user)
		})
	})(req, res)
});

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
    
    console.log(request.user);

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
