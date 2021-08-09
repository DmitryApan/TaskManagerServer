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

const connectionUri = 'mongodb+srv://admin:admin@cluster0-tjm8e.mongodb.net/test?retryWrites=true&w=majority';
mongoose.set('useFindAndModify', false);
mongoose.connect(connectionUri, {useNewUrlParser: true, useUnifiedTopology: true});

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
                return done(null, user._id);
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

function wrapperData(data, error, code) {
	return {
		data: {...data},
		resultCode: code || (error ? 1 : 0),
		error: error ? (error.isArray ? [...error] : [error]) : []
	}
}

app.get('/auth', function (req, res) {
    const {user} = req;

	if (user) {
		return res.send(wrapperData({id: user}));
	} 
		
	res.send(wrapperData(null, 'You are not authorized'));	
})

app.post('/login', function (req, res) {
    passport.authenticate('local', function (err, user, info) {
		if (err) {
			return res.send(wrapperData(null, err));
		}

		if (!user) {
			return res.send(wrapperData(null, info.message));
		}

		req.logIn(user, function (err) {
			if (err) {
				return res.send(wrapperData(null, err));
			}
			
			if (req.body.rememberMe) {
				req.session.cookie.expires = true
				req.session.cookie.maxAge = 180 * 24 * 60 * 60 * 1000
				req.session.save()
			}

            return res.send(wrapperData({id: user}))
		})
	})(req, res)
});

app.get('/logout', function(req, res){
    const {user} = req;
    
    req.logout();

    req.session.destroy(function () {
		res.cookie("connect.sid", "", { 
			expires: new Date(), 
			sameSite: 'none',
			secure: true,  
		}).send(wrapperData({id: user}));
	});
});

app.post('/register', (req, res) => {
    const {user} = req
	const {email, password, rememberMe} = req.body	

	if (user) {
		return res.send(wrapperData(null, 'You are authorized'))
	}

	if (!email || !password) {
		return res.send(wrapperData(null, 'Not all data'))		
	}

	User.findOne({ email }, function (err, user) {
		if (user) {
			return res.send(wrapperData(null, 'User exists'))
		}

		if (err) {
			return res.send(wrapperData(null, err))
		}

		const newUser = new User({email, password})
		newUser.save(function (err, user) {
			if (err) {
				return res.send(wrapperData(null, err))
			} 

			req.logIn(user._id, function (err) {
				if (err) {
					return res.send(wrapperData(null, err))
				} 
				
				if (rememberMe) {
					req.session.cookie.expires = true
					req.session.cookie.maxAge = 180 * 24 * 60 * 60 * 1000
					req.session.save()
				}

				res.send(wrapperData({id: user._id}));				
			});			
		});
	});
});

app.get('/cards', (request, response) => {
    const {user} = request;

    if (user) {
        Card.find((err, cards) => {
        if (err) {
            response.send(wrapperData(null, err));
        } else {
            response.send(wrapperData(cards._doc));
        }});        
    } else {
        response.send(wrapperData(null, 'You are not authorized'));
    }    
});

app.post('/card', (request, response) => {
    const { title, description, status } = request.body;
    const {user} = request;

    if (user) {
        if (title) {
            const card = new Card({ description, title, status: status || 'Open', owners: [] });
    
            card.save((err, entity) => {
                if (err) {
                    response.send(wrapperData(null, err));
                } else {
                    response.send(wrapperData(entity));
                }
            });
        } else {
            response.send(wrapperData(null, 'where is title, dude?'));
        }
    } else {
        response.send(wrapperData(null, 'You are not authorized')); 
    }    
});

app.put('/card/:id', (request, response) => {
    const { id } = request.params;
    const {user} = request;

    if (user) {
        if (id) {
            Card.findByIdAndUpdate(id, request.body, {new: true}, (err, entity) => {
                if (err) {
                    response.send(wrapperData(null, err));
                } else {
                    response.send(wrapperData(entity._doc));
                }
            });
        } else {
            response.send(wrapperData(null, 'where is id, dude?'));
        }
    } else {
        response.send(wrapperData(null, 'You are not authorized'));
    }    
});

app.delete('/card/:id', (request, response) => {
    const { id } = request.params;
    const {user} = request;

    if (user) {
        if (id) {
            Card.findByIdAndRemove(id, (err, entity) => {
                if (err) {
                    response.send(wrapperData(null, err));
                } else {
                    response.send(wrapperData(entity._doc));
                }
            });
        } else {
            response.send(wrapperData(null, 'where is id, dude?'));
        }
    } else {
        response.send(wrapperData(null, 'You are not authorized'));
    }   
});

app.get('/users', (request, response) => {
    const {user} = request;

    if (user) {
        User.find((err, users) => {
            if (err) {
                response.send(wrapperData(null, err));
            } else {
                response.send(wrapperData(users._doc));
            }
        });
    } else {
        response.send(wrapperData(null, 'You are not authorized'));
    }
});

app.put('/user', (request, response) => {
    let {id} = request.body;
    const {user} = request;

    if (user) {

        if (!id) { id = user; }       

        User.findOneAndUpdate({_id: id}, request.body, {new: true}, (err, entity) => {
            if (err) {
                response.send(wrapperData(null, err));
            } else {
                response.send(wrapperData(entity._doc));
            }
        });
        
    } else {
        response.send(wrapperData(null, 'You are not authorized'));
    }
});

app.get('/settings', (request, response) => {
    const {user} = request;

    if (user) {
        Settings.find((err, settings) => {
            if (err) {
                response.send(wrapperData(null, err));
            } else {
                response.send(wrapperData(settings[0]._doc));
            }
        });
    } else {
        response.send(wrapperData(null, 'You are not authorized'));
    }
});

app.put('/settings/:id', (request, response) => {
    const { id } = request.params;
    const {user} = request;

    if (user) {
        if (id) {
            Settings.findByIdAndUpdate(id, request.body, {new: true}, (err, entity) => {
                if (err) {
                    response.send(wrapperData(null, err));
                } else {
                    response.send(wrapperData(entity._doc));
                }
            });
        } else {
            response.send(wrapperData(null, 'where is id, dude?'));
        }
    } else {
        response.send(wrapperData(null, 'You are not authorized'));
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
