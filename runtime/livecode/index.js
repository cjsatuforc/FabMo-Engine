var log = require('../../log').logger('livecode');
var config = require('../../config');
var stream = require('stream');

// TH my prev values
// //var T_RENEW = 500;
// var T_RENEW = 5000;
// var SAFETY_FACTOR = 1.25;
// var RENEW_SEGMENTS = 15;
var T_RENEW = 250;
var SAFETY_FACTOR = 2;
var RENEW_SEGMENTS = 3;

function LiveCodeRuntime() {
	this.machine = null;
	this.driver = null;
	this.fixedQueue = [];  //TH new
}

LiveCodeRuntime.prototype.toString = function() {
	return "[LiveCodeRuntime]";
};

//TH new ... maybe should be false to avoid auth
//Check if auth is neeeded to execute code
LiveCodeRuntime.prototype.needsAuth = function(s) {
	//all manual needs auth (check) so just return true
	return true;
}

LiveCodeRuntime.prototype.connect = function(machine) {
	this.machine = machine;
	this.driver = machine.driver;
	this.ok_to_disconnect = true;
	this.machine.setState(this, "livecode");

	//TH new ... section seems insignificantly changed
	// True while the tool is known to be in motion
	this.moving = false;

	// True while the user intends (as far as we know) for the tool to continue moving
	this.keep_moving = false;

	// Current trajectory
	this.current_axis = null;
	this.current_speed = null;
	this.completeCallback = null;
	this.status_handler = this._onG2Status.bind(this);
	this.driver.on('status',this.status_handler);
};

LiveCodeRuntime.prototype.disconnect = function() {
//TH 	if(this.ok_to_disconnect) {
	if(this.ok_to_disconnect && !this.stream) {
		log.info("DISCONNECTING MANUAL RUNTIME")
		this.driver.removeListener('status', this.status_handler);
		this._changeState("idle");	
	} else {
		throw new Error("Cannot disconnect while manually driving the tool.");
	}
};

LiveCodeRuntime.prototype._changeState = function(newstate, message) {
	log.debug("Changing to livecode - " + newstate)
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
//TH reorganized from here
	this.machine.emit('status',this.machine.status);
};

// 	switch(this.machine.status.state) {
// 		case "not_ready":
// 			// This shouldn't happen.
// 			log.error("WAT.");
// 			break;

// 		//TH
// 		case "livecode":
// 			if(status.stat === this.driver.STAT_HOLDING && status.stat === 0) {
// 				this._changeState("paused");
// 				break;
// 			}

// 			if((status.stat === this.driver.STAT_STOP || status.stat === this.driver.STAT_END) && status.hold === 0) {
// 				this._changeState("idle");
// 				break;
// 			}
// 			break;

// 		case "paused":
// 			if((status.stat === this.driver.STAT_STOP || status.stat === this.driver.STAT_END) && status.hold === 0) {
// 				this._changeState("idle");
// 				break;
// 			}
// 			break;

// 		case "idle":
// 			if(status.stat === this.driver.STAT_RUNNING) {
// //TH				this._changeState("manual");
// 				this._changeState("livecode");
// 				break;
// 			}
// 			break;

// 		case "stopped":
// 			switch(status.stat) {
// 				case this.driver.STAT_STOP:			
// 				case this.driver.STAT_END:
// 					this._changeState("idle");
// 					break;
// 			}
// 			break;

// 	}
// 	this.machine.emit('status',this.machine.status);
// };


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
//			this.startMotion(code.axis, code.speed);
			this.startMotion(code.xloc, code.yloc, code.zloc, code.speed);
			break;

		case 'stop':
			this.stopMotion();
			break;

		case 'maint':
			this.maintainMotion();
			break;

		case 'fixed':
			this.fixedMove(code.axis, code.speed, code.distance);
			break;

		default:
			log.error("Don't know what to do with '" + code.cmd + "' in livecode command.");
	}
};

LiveCodeRuntime.prototype.maintainMotion = function() {
//TH new	this.keep_moving = true;
	log.debug("MAINTAIN")
	if(this.moving) {
		this.keep_moving = true;		
	}	
};

/*
 * Called to set the tool into motion.
 * If the tool is already moving, the flag is set to maintain that motion
 */
//LiveCodeRuntime.prototype.startMotion = function(axis, speed) {
LiveCodeRuntime.prototype.startMotion = function(xloc, yloc, zloc, speed) {
//var speed = 200;
//var axis = "x";	
//	var dir = speed < 0 ? -1.0 : 1.0;
//	speed = Math.abs(speed);
// if(this.moving) {
// 	log.debug("startMotion: Already moving");
// 	if(axis === this.currentAxis && speed === this.currentSpeed) {
// 		this.maintainMotion();
// 	} else {
// 		// Deal with direction changes here
// 	}
// } else {
//		log.debug("startMotion: Not moving yet.");
//		this.currentAxis = axis;
//		this.currentSpeed = speed;
//		this.currentDirection = dir;
//		this.renewDistance = speed*(T_RENEW/60000)*SAFETY_FACTOR;
//		this.renewDistance = speed*(5000/60000)*SAFETY_FACTOR;
//		this.moving = this.keep_moving = true;
//		this.xMove = 100;
//		this.yMove = 85;
    //log.debug("what is " + this.toString());

//TH latest STREAM version
			if(!this.stream) {
				this.stream = new stream.PassThrough();
				this._changeState("manual");
				this.moving = this.keep_moving = true;
				this.driver.runStream(this.stream).then(function(stat) {
					//stream.close()
					log.info("Finished running stream: " + stat);
					this.moving = false;
					this.keep_moving = false;
					this.stream = null;
					this._changeState("idle");
					//config.driver.restoreSome(['zl'], function() {
					//	log.debug("Restored Z lift value.")
					//});
				}.bind(this));
			} else {
				throw new Error("Trying to create a new motion stream when one already exists!");
			}
//			this.stream.write('G91 F' + this.currentSpeed.toFixed(3) + '\n');
//			this.renewMoves();

	this.xMove = xloc;
	this.yMove = yloc;
	this.zMove = zloc;
    this.speed = speed;
    move = "";
log.debug("liveStart-prep: " + this.yMove + "," + this.zMove + "," + this.speed);
    if (this.xMove !== undefined) move += ('G0 X' + this.xMove.toFixed(5));
    if (this.yMove !== undefined) move += ('G0 Y' + this.yMove.toFixed(5));
    if (this.zMove !== undefined) move += ('G0 Z' + this.zMove.toFixed(5));
    if (this.speed !== undefined) move += ('F' + this.speed.toFixed(3));
    move += '\n';
//log.debug("liveStart-to: " + move);
//TH new try this??
			// this.stream.write('G91 F' + this.currentSpeed.toFixed(3) + '\n');
			// this.renewMoves();

			this.stream.write(move);

//TH old	this.driver.gcodeWrite(move);
//		 this.renewMoves();
//	}
};

LiveCodeRuntime.prototype.renewMoves = function() {
  log.debug("unexpected renewMove in livecode");
// 	if(this.keep_moving) {
// 		this.keep_moving = false;
// 		var segment = this.currentDirection*(this.renewDistance / RENEW_SEGMENTS);
// //		var move = 'G91 F' + this.currentSpeed.toFixed(3) + '\n';
// 		var move = 'G90 F' + this.currentSpeed.toFixed(3) + '\n';
// //		for(var i=0; i<RENEW_SEGMENTS; i++) {
// //			move += ('G1 ' + this.currentAxis + segment.toFixed(5) + '\n');
// //		}
// 	move += ('G0 X' + this.xMove.toFixed(5) + 'Y' + this.yMove.toFixed(5) + ' \n');
// 		this.driver.gcodeWrite(move);
// //		setTimeout(this.renewMoves.bind(this), T_RENEW)		
// 	} else {
// 		if(this.machine.status.state != "stopped") {
// 			this.stopMotion();	
// 		}
// 	}
};

LiveCodeRuntime.prototype.stopMotion = function() {
  log.debug("unexpected stopMotion in livecode");
	// if(this._limit()) { return; }
	// this.keep_moving = false;
	// this.moving = false;
	// this.driver.quit();
};

LiveCodeRuntime.prototype.fixedMove = function(axis, speed, distance) {
  log.debug("unexpected fixedMove in livecode");
//TH now ENTIRELY DIFFERENT
// 	if(this.moving) {
// 		log.warn("fixedMove: Already moving");
// 	} else {
// 		axis = axis.toUpperCase();
// 		if('XYZABCUVW'.indexOf(axis) >= 0) {
// 			var move;
// 			if(speed) {
// 				move = 'G91\nG1 ' + axis + distance.toFixed(5) + ' F' + speed.toFixed(3) + '\n';
// 			} else {
// 				move = 'G91\nG0 ' + axis + distance.toFixed(5) + '\n';				
// 			}
// 			this.driver.gcodeWrite(move);
// log.debug("livecodeFIXEDMOVE >> " + axis);
// 		}
// 	}
};

LiveCodeRuntime.prototype.pause = function() {
	this.driver.feedHold();
};

LiveCodeRuntime.prototype.quit = function() {
//TH	this.driver.quit();
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
