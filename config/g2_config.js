async = require('async');
util = require('util');
Config = require('./config').Config;

var log = require('../log').logger('g2config');

// A G2Config is the configuration object that stores the configuration values for G2.
// G2 configuration data is *already* JSON formatted, so G2Config objects are easy to create from config files using `load()`
// A G2Config object is bound to a driver, which gets updated when configuration values are loaded/changed.
G2Config = function(driver) {
	Config.call(this, 'g2');
};
util.inherits(G2Config, Config);

G2Config.prototype.init = function(driver, callback) {
	this.driver = driver;
	this.aliases = {};
	this.loadFromDriver(function(err, values) {
		if(err) {
			callback(err);
		} else {
			this._loaded = true;
			// log.info(JSON.stringify({values: values}));
			this._cache = values;
			for (var k1 in values) {
				if (values.hasOwnProperty(k1)) {
					var subvalue = values[k1];
					for (var k2 in subvalue) {
						if (subvalue.hasOwnProperty(k2)) {
							if (k1 !== 'sys') {
								this.aliases[''+k1+k2] = [k1, k2];
							} else {
								this.aliases[''+k2] = [k1, k2];
							}
						}
					}
				}
			}
			this.save(function(){});
			Config.prototype.init.call(this, callback);
		}
	}.bind(this));
}

G2Config.prototype.changeUnits = function(units, callback) {
	var self = this;
	this.driver.setUnits(units, function(err, data) {
		if (err) {
			callback(err);
		} else {
			callback(null, data);
			this.loadFromDriver(function(err, values) {
				if(err) {
					callback(err);
				} else {
					log.info(JSON.stringify({updated_values: values}));
					self._cache = values;
				}
			}).bind(this);
		}
	}.bind(this));
}

function extend(obj, src) {
		for (var key in src) {
			if (src.hasOwnProperty(key)) obj[key] = src[key];
		}
		return obj;
	}

G2Config.prototype.loadFromDriver = function(callback) {
	this.driver.get('$', callback);
}

// override of Config
// setMany calls update, which then calls this
G2Config.prototype.set = function(k, v, callback) {
	if (this.driver) {
		if (!(k in this._cache)) {
			if (k in this.aliases) {
				var alias = this.aliases[k];

				k = alias[0];

				var new_v = {};
				new_v[alias[1]] = v;
				v = new_v;
			}
		}
		else if (typeof v === 'object')
		{
			// we will call set for each key, and merge them back and return
			var keys = Object.keys(v);
			async.map(
				keys,

				// Function called for each item in the keys array
				function(k2, cb) {
					var v2 = {};
					v2[k2] = v[k2];
					this.driver.set(k, v2, cb);
				}.bind(this),

				// Function to call with the list of results
				function(err, results) {
					if (err) {
						// we lost the association of what triggered the error
						// no point in trying to return results
						return callback(err);
					}

					log.info(JSON.stringify({results: results}));
					// results should look like:
					// [
					// 	{am:1},
					// 	{vm:1000},
					// 	...
					// ]
					r = {};
					r[k] = {};
					var self = this;
					results.map(function (v2) {
						Object.keys(v2).map(function (k2) {
							if (v2.hasOwnProperty(k2)) {
								r[k][k2] = v2[k2];
								if (v2[k2] !== null) {
									self._cache[k][k2] = v2[k2];
								}
							}
						});
					});
					// log.info(JSON.stringify({arr: r}));
					callback(null, r);
				}.bind(this)
			); // async.map

			return;
		} // else if (typeof v === 'object')

		this.driver.set(k, v, function(err, data) {
			log.info(JSON.stringify({KEY: k, DATA: data}));
			if (typeof data === 'object') {
				Object.keys(data).map(function (k2) {
					this._cache[k][k2] = data[k2];
				}.bind(this));
			} else {
				this._cache[k] = data;
			}
			// log.info(JSON.stringify({_cache2: this._cache}));
			callback(err, data);
		}.bind(this));
	} else {
		// no driver
		callback(null);
	}
};

// override of Config
G2Config.prototype.get = function(k_obj) {
	if (typeof k === 'object') {
		var v = k_obj;
		Object.keys(v).map(function (k) {
			if (v.hasOwnProperty(k) && k in this._cache) {
				if (typeof v[k] === 'object') {
					// two-level request
					Object.keys(v[k]).map(function (k2) {
						if (v[k].hasOwnProperty(k2) && k2 in this._cache[k]) {
							if (v[k][k2] === null) {
								v[k][k2] = this._cache[k][k2];
							}
							// don't go deeper, and not' lookup non-null
							// so, leave it alone
						}
					}.bind(this));
				} else if (v[k] === null) {
					v[k] = this._cache[k]; // WARNING, we're returning a mutable reference
					// TODO: make a copy
				}
			}
		}.bind(this));

		return v;
	}

	var k = k_obj;

	if (k in this._cache) {
		return this._cache[k];
	} else {
		if (k in this.aliases) {
			var alias = this.aliases[k];
			if (alias[0] in this._cache && alias[1] in this._cache[alias[0]]) {
				return this._cache[alias[0]][alias[1]];
			}
		}
	}

	return null;
};

// override of Config
G2Config.prototype.has = function(k) {
	// assuming a string, not a request object here
	// also, we only have aliases for things we actually have
	return (k in this._cache) || (k in this.aliases);
};

// override of Config
G2Config.prototype.getMany = function(arr) {
	retval = {};
	arr.map(function (key) {
		retval[key] = null;
	});
	return this.get(retval);
};

// override of Config
// calls update, which then calls set
G2Config.prototype.setMany = function(data, callback) {
	this.update(data, function(err, result) {
		if(callback && typeof callback === 'function') {
			callback(err, result);
		} else {
			log.warn("No callback passed to setMany");
		}
		this.emit('change', data);
	}.bind(this));
}

// override of Config
G2Config.prototype.deleteMany = function(keys, callback) {
	callback(new Error('Cannot delete from the G2 board keys'));
}

// override of Config
G2Config.prototype.delete = function(k, callback) {
	callback(new Error('Cannot delete from the G2 board keys'));
}


// Update the configuration with the data provided (data is just an object with configuration keys/values)
// call this.set for each key
G2Config.prototype.update = function(data, callback) {
	var keys = Object.keys(data);
	async.mapSeries(
		keys,
		// Call driver.set() for each item in the collection of data that was passed in.
		function iterator(key, cb) {
			this.set(key, data[key], cb);
		}.bind(this),
		// Update the cache with all the values returned from the hardware
		function done(err, results) {
			if (err) { return callback(err); }

			this.save(function(){});

			callback(null, results);
		}.bind(this)
	);
};

G2Config.prototype.restore = function(callback) {
	this.update(this._cache, callback);
}

G2Config.prototype.restoreSome = function(keys, callback) {
  cache = {};
	keys.forEach(function(key) {
		cache[key] = this._cache[key];
	}.bind(this));
	this.update(cache, callback);
}

// Status reports are special, and their format must be whats expected for the machine/runtime environments
// to work properly.
// TODO: Move this data out into a configuration file, perhaps.
G2Config.prototype.configureStatusReports = function(callback) {
	if(this.driver) {
	this.driver.command({"sr":{
						"posx":true,
						"posy":true,
						"posz":true,
						"posa":true,
						"posb":true,
						"vel":true,
						"stat":true,
						"hold":true,
						"line":true,
						"coor":true,
						"unit":true,
						"in1":true,
						"in2":true,
						"in3":true,
						"in4":true,
						"in5":true,
						"in6":true,
						"in7":true,
						"in8":true,
						"out1":true,
						"out2":true,
						"out3":true,
						"out4":true,
						"out5":true,
						"out6":true,
						"out7":true,
						"out8":true
					}});
		this.driver.command({"qv":0});
		this.driver.command({"jv":4});
		this.driver.requestStatusReport();
		return callback(null, this);
	} else {
		return callback(null, this);
	}
};
exports.G2Config = G2Config;
