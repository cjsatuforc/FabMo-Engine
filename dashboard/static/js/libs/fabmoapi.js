;(function (root, factory) {


  /* CommonJS */
  if (typeof module == 'object' && module.exports) module.exports = factory()

  /* AMD module */
  else if (typeof define == 'function' && define.amd) define([], factory)

  /* Browser global */
  else root.FabMoAPI = factory()

}(this, function (io) {
  "use strict"

var PING_TIMEOUT = 3000;
var makePostData = function(obj, options) {
	var file = null;
	if(obj instanceof jQuery) {
		if(obj.is('input:file')) {
			obj = obj[0];
		} else {
			obj = obj.find('input:file')[0];
		}
		file = obj.files[0];
	} else if(obj instanceof HTMLInputElement) {
		file = obj.files[0];
	} else if(obj instanceof File || obj instanceof Blob) {
		file = obj;
	} else if(typeof obj === "string") {
		file = Blob(obj, {'type' : 'text/plain'});
	}

	if(!file) {
		var msg = 'Cannot make post data from ' + JSON.stringify(obj);
		throw new Error(msg);
	}

	var job = {}
	var options = options || {};
	for(var key in options) {0
		job[key] = options[key];
	}
	job.file = file;
	return job;
}


var FabMoAPI = function(base_url) {
	this.events = {
		'status' : [],
		'disconnect' : [],
    	'authentication_failed':[],
		'connect' : [],
		'job_start' : [],
		'job_end' : [],
		'change' : [],
    	'video_frame': [],
	};
	var url = window.location.origin;
	this.base_url = url.replace(/\/$/,'');
	this.commandCounter = 0;
	this.status = {};
	this.config = {};
	this._initializeWebsocket();
}

FabMoAPI.prototype._initializeWebsocket = function() {
	var io = require("socket.io/node_modules/socket.io-client/socket.io.js");
	localStorage.debug = false
	try {
		this.socket = io.connect(this.base_url+'/private');
	} catch(e) {
		this.socket = null;
		console.error('connection to the engine via websocket failed : '+ e.message);
	}

	if(this.socket) {
		this.socket.on('status', function(status) {
			this._setStatus(status);
			this.emit('status', status);
		}.bind(this));

		this.socket.on('change', function(topic) {
			this.emit('change', topic);
		}.bind(this));

		this.socket.on('connect', function() {
			console.info("Websocket connected");
			this.emit('connect');
			this.requestStatus();
		}.bind(this));

		this.socket.on('message', function(message) {console.info("Websocket message: " + JSON.stringify(message))} );

		this.socket.on('disconnect', function() {
			console.info("Websocket disconnected");
			this.emit('disconnect');
		}.bind(this));

        this.socket.on('authentication_failed', function(message) {
          this.emit('authentication_failed',message);
        }.bind(this));

		this.socket.on('connect_error', function() {
			this.emit('disconnect');
			console.info("Websocket disconnected (connection error)");
		}.bind(this));

	}
}

FabMoAPI.prototype.startVideoStreaming = function(callback){
  try {
    this.videoSocket = io(this.base_url+'/video');
  } catch(e) {
  	this.videoSocket = null;
  	console.info('connection to the video streaming via websocket failed.');
  }

  if(this.videoSocket) {
    this.videoSocket.on('frame', function(data) {
      this.emit('video_frame', data);

    }.bind(this));

    this.videoSocket.on('connect', function() {
      console.log("Video streaming websocket connected");
    }.bind(this));

    this.videoSocket.on('message', function(message) {console.info(" Video streaming websocket message: " + JSON.stringify(message))} );

    this.videoSocket.on('disconnect', function() {
      console.info("Video streaming websocket disconnected");
    }.bind(this));

    this.videoSocket.on('connect_error', function() {
      console.info("Video streaming websocket disconnected (connection error)");
    }.bind(this));
  }
  callback();
}

FabMoAPI.prototype.emit = function(evt, data) {
	var handlers = this.events[evt];
	if(handlers) {
		for(var i=0; i<handlers.length; i++) {
			handlers[i](data);
		}
	}
}

FabMoAPI.prototype.on = function(message, func) {
	if(message in this.events) {
		this.events[message].push(func);
	}
}

FabMoAPI.prototype._setStatus = function(status) {
	var old_status = this.status;
	this.status = status;
	if(old_status.job && !status.job) {
		this.emit('job_end', old_status.job);
	}
	if(!old_status.job && status.job) {
		this.emit('job_start', status.job);
	}

}

FabMoAPI.prototype.ping = function(callback) {
	if(this.socket) {
		var start = Date.now();

		var fail = setTimeout(function() {
			this.socket.off('pong');
			callback(new Error('Timeout waiting for ping response.'), null);
		}.bind(this), PING_TIMEOUT);

		this.socket.once('pong', function() {
			clearTimeout(fail);
			callback(null, Date.now()-start);
		});
		this.socket.emit('ping');
	}
}

FabMoAPI.prototype.sendTime = function(callback) {
	var d = new Date();
	var t = d.getTime();
	var data = {'ms' : t };
	this._post('/time/date', data, callback, callback);
}

// Updater Configuration

FabMoAPI.prototype.getUpdaterConfig = function(callback) {
	var callback = callback || function() {};
	this._get('updater/config', callback, function(err, data) {
		this.updater_config = data;
		callback(err, data);
	}.bind(this), 'config');
}

FabMoAPI.prototype.setUpdaterConfig = function(cfg_data, callback) {
	this._post('updater/config', cfg_data, callback, function(err, data) {
		callback = callback || function() {};
		callback(null, cfg_data);
	});
}

// Configuration
FabMoAPI.prototype.getConfig = function(callback) {
	var callback = callback || function() {};
	this._get('/config', callback, function(err, data) {
		this.config = data;
		callback(err, data);
	}.bind(this), 'config');
}

FabMoAPI.prototype.setConfig = function(cfg_data, callback) {
	this._post('/config', cfg_data, callback, function(err, data) {
		callback = callback || function() {};
		callback(null, cfg_data);
	});
}

// Status
FabMoAPI.prototype.getVersion = function(callback) {
	this._get('/version', callback, function(err, version) {
		if(err) {
			callback(err);
		}
		this.version = version;
		callback(null, version);
	}.bind(this), 'version');
}

// Status
FabMoAPI.prototype.getStatus = function(callback) {
	this._get('/status', callback, callback, 'status');
}

FabMoAPI.prototype.requestStatus = function() {
	this.socket.emit('status');
}

// Direct commands
FabMoAPI.prototype.quit = function(callback) {
	this.command('quit');
}

FabMoAPI.prototype.pause = function(callback) {
	this.command('pause');
}

FabMoAPI.prototype.resume = function(callback) {
	this.command('resume');
}

// Jobs
FabMoAPI.prototype.getJobQueue = function(callback) {
	this._get('/jobs/queue', callback, callback, 'jobs');
}

FabMoAPI.prototype.getJob = function(id, callback) {
	this._get('/job/' + id, callback, callback, 'job');
}

FabMoAPI.prototype.getJobInfo = FabMoAPI.prototype.getJob;

FabMoAPI.prototype.resubmitJob = function(id, callback) {
	this._post('/job/' + id, {}, callback, callback);
}

FabMoAPI.prototype.updateOrder= function(data, callback) {
	this._patch('/job/' + data.id, data, callback, callback);
}

FabMoAPI.prototype.runNextJob = function(callback) {
	console.log("I got called");
	this._post('/jobs/queue/run', {}, callback, callback);
}

FabMoAPI.prototype.getJobHistory = function(options, callback) {
	var start = options.start || 0;
	var count = options.count || 0;
	this._get('/jobs/history?start=' + start + '&count=' + count, callback, callback, 'jobs');
}

FabMoAPI.prototype.getJob = function(id, callback) {
	this._get('/job/' + id, callback, callback, 'job');
}

FabMoAPI.prototype.getJobs = function(callback) {
	this._get('/jobs', callback, callback, 'jobs');
}

FabMoAPI.prototype.deleteJob = function(id, callback) {
	this._del('/job/' + id, {}, callback, callback, 'job');
}


FabMoAPI.prototype.clearJobQueue = function(id, callback) {
	this._del('/jobs/queue', callback, callback);
}

FabMoAPI.prototype.getJobsInQueue = function(callback) {
	this._get('/jobs/queue', callback, callback, 'jobs');
}

// Apps
FabMoAPI.prototype.getApps = function(callback) {
	this._get('/apps', callback, callback, 'apps');
}

FabMoAPI.prototype.deleteApp = function(id, callback) {
	this._del('/apps/' + id, {}, callback, callback);
}

FabMoAPI.prototype.submitApp = function(apps, options, callback) {
	this._postUpload('/apps', apps, {}, callback, callback, 'apps');
}

FabMoAPI.prototype.getAppConfig = function(app_id, callback) {
	this._get('/apps/' + app_id + '/config', callback, callback, 'config');
}

FabMoAPI.prototype.setAppConfig = function(id, cfg_data, callback) {
	this._post('/apps/' + id + '/config', {'config': cfg_data}, callback, callback, 'config');
}

// Macros
FabMoAPI.prototype.getMacros = function(callback) {
	this._get('/macros', callback, callback, 'macros');
}

FabMoAPI.prototype.runMacro = function(id, callback) {
	this._post('/macros/' + id + '/run', {}, callback, callback, 'macro');
}

FabMoAPI.prototype.updateMacro = function(id, macro, callback) {
	this._post('/macros/' + id, macro, callback, callback, 'macro');
}

FabMoAPI.prototype.deleteMacro = function(id, callback) {
	this._del('/macros/' + id, {}, callback, callback);
}

FabMoAPI.prototype.runCode = function(runtime, code, callback) {
	console.log('this is some shit');
	var data = {'cmd' : code, 'runtime':runtime}
	this._post('/code', data, callback, callback);
}

FabMoAPI.prototype.gcode = function(code, callback) {
	this.runCode('gcode', code, callback);
}

FabMoAPI.prototype.sbp = function(code, callback) {
	this.runCode('sbp', code, callback);
}

FabMoAPI.prototype.executeRuntimeCode = function(runtime, code, callback) {
	this.socket.emit('code', {'rt' : runtime, 'data' : code})
}

FabMoAPI.prototype.manualStart = function(axis, speed) {
	this.executeRuntimeCode('manual', {'cmd': 'start', 'axis' : axis, 'speed' : speed});
}

FabMoAPI.prototype.manualHeartbeat = function() {
	this.executeRuntimeCode('manual', {'cmd': 'maint'});
}

FabMoAPI.prototype.manualStop = function() {
	this.executeRuntimeCode('manual', {'cmd': 'stop'});
}

FabMoAPI.prototype.manualMoveFixed = function(axis, speed, distance) {
	this.executeRuntimeCode('manual', {'cmd': 'fixed', 'axis' : axis, 'speed' : speed, 'dist' : distance});
}

FabMoAPI.prototype.connectToWifi = function(ssid, key, callback) {
	var data = {'ssid' : ssid, 'key' : key};
	this._post('/network/wifi/connect', data, callback, callback);
}

FabMoAPI.prototype.disconnectFromWifi = function(callback) {
	this._post('/network/wifi/disconnect', {}, callback, callback);
}

FabMoAPI.prototype.forgetWifi = function(callback) {
	this._post('/network/wifi/forget', {}, callback, callback);
}

FabMoAPI.prototype.enableWifi = function(callback) {
	var data = {'enabled' : true};
	this._post('/network/wifi/state', data, callback, callback);
}

FabMoAPI.prototype.disableWifi = function(callback) {
	var data = {'enabled' : false};
	this._post('/network/wifi/state', data, callback, callback);
}

FabMoAPI.prototype.enableHotspot = function(callback) {
	var data = {'enabled' : true};
	this._post('/network/hotspot/state', data, callback, callback);
}

FabMoAPI.prototype.disableHotspot = function(callback) {
	var data = {'enabled' : false};
	this._post('/network/hotspot/state', data, callback, callback);
}

FabMoAPI.prototype.getNetworkIdentity = function(callback) {
	this._get('/network/identity', callback, callback);
}

FabMoAPI.prototype.setNetworkIdentity = function(identity, callback) {
	this._post('/network/identity', identity, callback, callback);
}

FabMoAPI.prototype.isOnline = function(callback) {
	this._get('/network/online', callback, callback, 'online');
}

FabMoAPI.prototype.getWifiNetworks = function(callback) {
	this._get('/network/wifi/scan', callback, callback, 'wifi');
}

FabMoAPI.prototype.getWifiNetworkHistory = function(callback) {
	this._get('/network/wifi/history', callback, callback, 'history');
}

FabMoAPI.prototype.getEthernetConfig = function(callback) {
	this._get('/network/ethernet/config', callback, callback);
}

FabMoAPI.prototype.setEthernetConfig = function(data, callback) {
	this._post('/network/ethernet/config', data, callback, callback);
}

FabMoAPI.prototype.submitJob = function(job, options, callback) {
	this._postUpload('/job', job, {}, callback, callback);
}
FabMoAPI.prototype.submitJobs = FabMoAPI.prototype.submitJob;

FabMoAPI.prototype.command = function(name, args) {
	this.socket.emit('cmd', {'name':name, 'args':args||{} , count : this.commandCounter} );
	this.commandCounter += 1;
}


FabMoAPI.prototype.getCurrentUser=function(callback){
  this._get("/authentication/user",callback,callback);
}

FabMoAPI.prototype.addUser=function(user_info,callback){
  this._post('/authentication/user',user_info,callback,callback);
}

FabMoAPI.prototype.modifyUser = function(user_info,callback){
  var id = user_info.user.id;
  user_info.user.id=undefined;
  var user = user_info;
  this._post('/authentication/user/'+id,user,callback,callback);
}

FabMoAPI.prototype.deleteUser = function(user_info,callback){
    var id = user_info.user._id;
    this._del("/authentication/user/"+id,{},callback,callback)
}

FabMoAPI.prototype.getUsers = function(callback){
    this._get("/authentication/users",callback,callback);
}

FabMoAPI.prototype.getUpdaterStatus = function(callback){
    this._get("/updater/status",callback,callback, 'status');
}

FabMoAPI.prototype._url = function(path) { return this.base_url + '/' + path.replace(/^\//,''); }

FabMoAPI.prototype._get = function(url, errback, callback, key) {
	var url = this._url(url);
	var callback = callback || function() {}
	var errback = errback || function() {}

	$.ajax({
		url: url,
		type: "GET",
		dataType : 'json',
		success: function(result){
			if(result.status === "success") {
				if(key) {
					callback(null, result.data[key]);
				} else {
					callback(null, result.data);
				}
			} else if(result.status==="fail") {
				errback(result.data);
			}	else {
				errback(result.message);
			}
		},
		error: function( data, err ){
			 errback(err);
		}
	});
}

FabMoAPI.prototype._postUpload = function(url, data, metadata, errback, callback, key) {
	//var url = this._url(url);
	var callback = callback || function() {};
	var errback = errback || function() {};

	// The POST Upload is done in two pieces.  First is a metadata post which transmits
	// an array of json objects that describe the files in question.
	// Following the metadata is a multipart request for each uploaded file.
	// So for N files, you have N+1 requests, the first for the metadata, and then N remaining for the files themselves.
	if(!Array.isArray(data)) {
		data = [data];
	}
	var meta = {
		files : [],
		meta : metadata
	}

	var files = [];
	data.forEach(function(item) {
		files.push(item.file);
		delete item.file;
		meta.files.push(item);
	});

	var onMetaDataUploadComplete = function(err, k) {
		if(err) {
			return errback(err);
		}
		var requests = [];
		files.forEach(function(file, index) {
			var fd = new FormData();
			fd.append('key', k);
			fd.append('index', index);
			fd.append('file', file);
			var onFileUploadComplete = function(err, data) {
				if(err) {
					// Bail out here too - fail on any one file upload failure
					requests.forEach(function(req) {
						req.abort();
					});
					return errback(err);
				}
				if(data.status === 'complete') {
					if(key) {
						callback(null, data.data[key]);
					} else {
						callback(null, data.data);
					}
				}
			}.bind(this);
			var request = this._post(url, fd, onFileUploadComplete, onFileUploadComplete);
			requests.push(request);
		}.bind(this));
	}.bind(this);
	this._post(url, meta, onMetaDataUploadComplete, onMetaDataUploadComplete, 'key');
}

FabMoAPI.prototype._post = function(url, data, errback, callback, key, redirect) {
	if(!redirect) {
		var url = this._url(url);
	}
	var callback = callback || function() {};
	var errback = errback || function() {};

	var xhr = new XMLHttpRequest();
	xhr.open('POST', url);

	if(!(data instanceof FormData)) {
		xhr.setRequestHeader('Content-Type', 'application/json');
		if(typeof data != 'string') {
			data = JSON.stringify(data);
		}
	}

	xhr.onload = function() {
		switch(xhr.status) {
			case 200:
				var response = JSON.parse(xhr.responseText);
				switch(response.status) {
					case 'success':
						if(key) {
							callback(null, response.data[key]);
						} else {
							callback(null, response.data);
						}
						break;

					case 'fail':
						if(key) {
							errback(response.data[key]);
						} else {
							errback(response.data);
						}
						break;
					default:
						errback(response.message);
						break;
				}
			break;

			case 300:
				// TODO infinite loop issue here?
				try {
					var response = JSON.parse(xhr.responseText);
					if(response.url) {
						this._post(response.url, data, errback, callback, key, true);
					} else {
						console.error("Bad redirect in FabMo API");
					}
				} catch(e) {
					console.error(e);
				}
				break;

			default:
				console.error("Got a bad response from server: " + xhr.status);
				break;
		}
    }.bind(this);
	xhr.send(data);
	return xhr;
}

FabMoAPI.prototype._patch = function(url, data, errback, callback, key) {
	var url = this._url(url);
	var callback = callback || function() {};
	var errback = errback || function() {};
	$.ajax({
		url: url,
		type: "PATCH",
		'data' : data,
		success: function(result){
			if(data.status === "success") {
				if(key) {
					callback(null, result.data.key);
				} else {
					callback(null,result.data);
				}
			} else if(data.status==="fail") {
				errback(result.data);
			} else {
				errback(result.message);
			}
		},
		error: function( data, err ){
			 errback(err);
		}
	});
}




FabMoAPI.prototype._del = function(url, data, errback, callback, key) {
	var url = this._url(url);
	var callback = callback || function() {};
	var errback = errback || function() {};
	$.ajax({
		url: url,
		type: "DELETE",
		dataType : 'json',
		'data' : data,
		success: function(result){
			if(data.status === "success") {
				if(key) {
					callback(null, result.data.key);
				} else {
					callback(null,result.data);
				}
			} else if(data.status==="fail") {
				errback(result.data);
			} else {
				errback(result.message);
			}
		},
		error: function( data, err ){
			 errback(err);
		}
	});
}

return FabMoAPI;
}));
