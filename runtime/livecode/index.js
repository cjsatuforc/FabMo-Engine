var log = require('../../log').logger('livecode');
var config = require('../../config');
var stream = require('stream');

var liveTimer; // TH ...for halting livecode action

// TH my prev values
// //var T_RENEW = 500;
// var T_RENEW = 5000;
// var SAFETY_FACTOR = 1.25;
// var RENEW_SEGMENTS = 15;
var T_RENEW = 30000;  // new delay to end streaming
//var T_RENEW = 250;
var SAFETY_FACTOR = 2;
var RENEW_SEGMENTS = 3;

function LiveCodeRuntime() {
	this.machine = null;
	this.driver = null;
	this.fixedQueue = [];  
}

LiveCodeRuntime.prototype.toString = function() {
	return "[LiveCodeRuntime]";
};

//TH new ... maybe should be false to avoid auth
//Check if auth is neeeded to execute code
LiveCodeRuntime.prototype.needsAuth = function(s) {
	//all manual needs auth (check) so just return true
	//return true;
	return false;
};

LiveCodeRuntime.prototype.connect = function(machine) {
	this.machine = machine;
	this.driver = machine.driver;
	this.ok_to_disconnect = true;
//	this.machine.setState(this, "livecode");
	this.machine.setState(this, "manual");

	// True while the tool is known to be in motion
	this.moving = false;

	// True while the user intends (as far as we know) for the tool to continue moving
	this.keep_moving = false;

	// Current trajectory
	this.current_axis = null; //TH not needed
	this.current_speed = null; //TH not needed
	this.completeCallback = null;
	this.status_handler = this._onG2Status.bind(this);
	this.driver.on('status',this.status_handler);
};

LiveCodeRuntime.prototype.disconnect = function() {
  log.debug('at disconnect - ' + this.ok_to_disconnect +','+ this.stream);
	if(this.ok_to_disconnect && !this.stream) {
  log.debug("DISCONNECTING LIVECODE RUNTIME")
		this.driver.removeListener('status', this.status_handler);
		this._changeState("idle");	
	} else {
		throw new Error("Cannot disconnect while manually driving the tool.");
	}
};

LiveCodeRuntime.prototype._changeState = function(newstate, message) {
  //NB ted, livecode not a state!
  log.debug("ChangingState ...  " + newstate);
	if(newstate === "idle") {
		this.ok_to_disconnect = true;
		var callback = this.completeCallback || function() {};
		this.completeCallback = null;
		callback();
	} else {
		this.ok_to_disconnect = false;
	}
	this.machine.setState(this, newstate, message);
};

LiveCodeRuntime.prototype._limit = function() {
	var er = this.driver.getLastException();
	if(er && er.st == 203) {
		var msg = er.msg.replace(/\[[^\[\]]*\]/,'');
		this.keep_moving = false;
		this.moving = false;
		this.driver.clearLastException();
		this._changeState('stopped', {error : msg});
		return true;
	}
	return false;
};


LiveCodeRuntime.prototype._onG2Status = function(status) {
	switch(status.stat) {
		case this.driver.STAT_INTERLOCK:
		case this.driver.STAT_SHUTDOWN:
		case this.driver.STAT_PANIC:
			return this.machine.die('A G2 exception has occurred. You must reboot your tool.');
		case this.driver.STAT_ALARM:
			if(this._limit()) { return; }
			break;
	}

	// Update our copy of the system status
	for (var key in this.machine.status) {
		if(key in status) {
			this.machine.status[key] = status[key];
		}
	}

	this.machine.emit('status',this.machine.status);
};

//TH Modeled after "manual runtime"; but differs somewhat in way functionality is used
LiveCodeRuntime.prototype.executeCode = function(code, callback) {
	this.completeCallback = callback;
log.debug("Recieved livecode command: " + JSON.stringify(code));
	
	// Don't honor commands if we're not in a position to do so
	switch(this.machine.status.state) {
		case "stopped":
			return;
	}

	switch(code.cmd) {
		case 'start':
//			this.startMotion(code.axis, code.speed); // ...TH we pass more than just axis and speed
			this.startMotion(code.xloc, code.yloc, code.zloc, code.speed);
			break;

		case 'stop':
			this.stopMotion();
			break;

		case 'maint': 
			this.maintainMotion();
			break;

		default:
			log.error("Don't know what to do with '" + code.cmd + "' in livecode command.");
	}
};

LiveCodeRuntime.prototype.maintainMotion = function() {
  log.debug('maintainMotion');
	if(this.moving) {
		this.keep_moving = true;		
	}
};

/*
 * Called to set the tool into motion and ...
 * If the tool is already moving, we keep pumping new commands
 */
//TH VERSION ... really more~ "doMotion" as we just keep pumping here
//ManualRuntime.prototype.startMotion = function(axis, speed) {
LiveCodeRuntime.prototype.startMotion = function(xloc, yloc, zloc, speed) {
    // TH 3 axes ...
	this.xMove = xloc;
	this.yMove = yloc;
	this.zMove = zloc;
	this.speed = speed;
//note: in Livecode using timer to STOP rather than Start-Maintain
	if(this.moving) {
		if(xloc || yloc || zloc ) {            // If action, keep pumping via renewMoves ...
		    //  ... using data above
			this.maintainMotion();
		} else {
			log.debug("not seeing any values, quit?")
			// time-out here?
		}

	} else {
		if(!this.stream) {
			this.stream = new stream.PassThrough();
			this._changeState("manual");
			this.moving = this.keep_moving = true;
			this.driver.runStream(this.stream).then(function(stat) {
				log.info("FINISHED running stream: " + stat);
				this.moving = false;
				this.keep_moving = false;
				this.stream = null;
				this._changeState("idle");
			}.bind(this));
			// //set a stop timer?? (only one)
			// log.debug("resetting liveTimer > " + liveTimer)
			// var liveTimer = setTimeout(function() {
			// 	//NOW timer STOPS action ... this.renewMoves();
			// 	this.stopMotion();	
			// }.bind(this), T_RENEW);

		} else {
			throw new Error("Trying to create a new motion stream when one already exists!");
		}
	    this.stream.write('G90 ' + '\n'); // initialize this motion
		//this.stream.write('G91 F' + this.currentSpeed.toFixed(3) + '\n');
	}	
	this.renewMoves();
};

LiveCodeRuntime.prototype.renewMoves = function() {
    log.debug("renewingMove in livecode");
//	var liveTimer;
	if(this.moving && this.keep_moving) {
		this.keep_moving = false;
		var move = "";
	  log.debug("liveStart-moveprep: " + this.xMove + "," + this.yMove + "," + this.zMove + "," + this.speed);
	    if (this.xMove !== undefined) move += ('G0 X' + this.xMove.toFixed(5));
	    if (this.yMove !== undefined) move += ('G0 Y' + this.yMove.toFixed(5));
	    if (this.zMove !== undefined) move += ('G0 Z' + this.zMove.toFixed(5));
	    if (this.speed !== undefined) move += ('F' + this.speed.toFixed(3));
	    move += '\n';

	    this.stream.write(move);                // PUMP ACTION HERE
		this.driver.prime();
		//set a stop timer?? (only one)
		log.debug("resetting liveTimer > " + liveTimer)
        clearTimeout(liveTimer);
		liveTimer = setTimeout(function() {
			//NOW timer STOPS action ... this.renewMoves();
			this.stopMotion();	
		}.bind(this), T_RENEW);

	} else {
		this.stopMotion();
	}
};

LiveCodeRuntime.prototype.stopMotion = function() {
    log.debug("END-ing; Calling driver-quit at stopMotion in livecode");
	this.driver.quit();
};

LiveCodeRuntime.prototype.fixedMove = function(axis, speed, distance) {
  log.debug("unexpected fixedMove in livecode");
//TH not used in livecode
};

LiveCodeRuntime.prototype.pause = function() {
	this.driver.feedHold();
};

LiveCodeRuntime.prototype.quit = function() {
	if(this.moving) {
		this.driver.quit();		
	}
	if(this.stream) {
		this.stream.end();
	}
};

LiveCodeRuntime.prototype.resume = function() {
	this.driver.resume();
};


exports.LiveCodeRuntime = LiveCodeRuntime;
