var settings = require('./settings');
var restify = require('restify');
var process = require('process');
var detection_daemon = require('./detection_daemon');
var machine = require('./machine');
var PLATFORM = process.platform;

var log = require('./log').logger('server');

// Connect to G2
machine.machine = machine.connect(function(error, data) {
	if(error) {
		log.error("There was an error connecting to the tool: " + data);
		process.exit(1);
	} else {

		// Successful connection made to G2: Setup the server.
		var server = restify.createServer({name:"FabMo Engine"});

		// Allow JSON over Cross-origin resource sharing 
		server.use(
		  function crossOrigin(req,res,next){
		    res.header("Access-Control-Allow-Origin", "*");
		    res.header("Access-Control-Allow-Headers", "X-Requested-With");
		    return next();
		  }
		);

		// Configure local directory for uploading files
		server.use(restify.bodyParser({'uploadDir':settings.upload_dir}));

		// The routes module maps URLs to functions of the API
		var routes = require('./routes')(server);

		// Kick off the server listening for connections
		server.listen(settings.server_port, function() {
		  log.info(server.name+ ' listening at '+ server.url);
		});
	}
});

// Initialize a detection daemon.
// This is a beacon server that allows the tool to be auto-discovered on the network.
new detection_daemon(24862);