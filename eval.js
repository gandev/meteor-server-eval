ServerEval = {
	version: "0.3",
	results: function() {
		return ServerEval._results.find({}, {
			sort: {
				eval_time: -1
			}
		});
	},
	metadata: function() {
		return ServerEval._metadata.find();
	},
	eval: function(expr, package) {
		Meteor.call('serverEval/eval', expr, package);
	},
	clear: function() {
		Meteor.call('serverEval/clear');
	}
};

if (Meteor.isClient) {
	ServerEval._results = new Meteor.Collection("server-eval-results");
	Meteor.subscribe("server-eval-results");

	ServerEval._metadata = new Meteor.Collection("server-eval-metadata");
	Meteor.subscribe("server-eval-metadata");
}

if (Meteor.isServer) {
	ServerEval._results = new Meteor.Collection("server-eval-results", {
		connection: null // not persistent
	});
	Meteor.publish("server-eval-results", function() {
		return ServerEval.results();
	});

	ServerEval._metadata = new Meteor.Collection("server-eval-metadata", {
		connection: null // not persistent
	});
	Meteor.publish("server-eval-metadata", function() {
		return ServerEval.metadata();
	});

	Meteor.startup(function() {
		var packages = _.keys(Package);
		var supported_packages = _.filter(packages, function(pkg) {
			return !!findEval(pkg);
		});
		ServerEval._metadata.insert({
			version: ServerEval.version,
			packages: packages,
			supported_packages: supported_packages
		});
	});

	//create json from object, filters circular dependencies 
	//and adds custom ____TYPE___ property
	var prettyResult = function(obj) {
		var cache = [];
		var path = [];

		var addToCache = function(value) {
			cache.push({
				path: path.join('.'),
				value: value
			});
		};

		var cached = function(value) {
			return _.find(cache, function(obj) {
				return obj.value === value;
			});
		};

		var formatObject = function(src_obj) {
			var dst_obj = _.isArray(src_obj) ? [] : {};

			//Errors - format stacktrace and create new error object
			if (src_obj instanceof Error) {
				var stacktrace = src_obj.stack && src_obj.stack.split("\n") || [];
				dst_obj = {
					____TYPE____: '[Error]',
					err: src_obj.toString(),
					stack: stacktrace.slice(1)
				};
				return dst_obj;
			}

			//Functions - convert in object
			if (_.isFunction(src_obj)) {
				src_obj = _.extend({}, src_obj);
				src_obj.____TYPE____ = "[Function]";
			}

			//walk the object tree recursively
			_.each(src_obj, function(value, key) {
				path.push(key);

				var _cached = cached(value);
				if (_cached) {
					//remove futures!? TODO consider
					if (key !== "future") {
						// Circular reference found
						dst_obj[key] = {
							____TYPE____: '[Circular]',
							path: _cached.path
						};
					}
				} else {
					if (_.isObject(value)) {
						addToCache(value);
						dst_obj[key] = formatObject(value);
					} else {
						dst_obj[key] = value;
					}
				}

				path.pop();
			});
			return dst_obj;
		};

		return formatObject(obj);
	};

	//checks if eval function in package scope available
	var findEval = function(package) {
		if (Package[package]) {
			var supported_package = _.find(_.values(Package[package]), function(exprt) {
				return !!exprt.__serverEval;
			});
			return supported_package && supported_package.__serverEval;
		}
	};

	Meteor.methods({
		'serverEval/eval': function(expr, package) {
			if (!expr || expr.length === 0) return;

			var eval_time = Date.now();
			var scope = "global";
			var result;
			var _eval = eval;

			if (Package[package]) {
				var scoped_eval = findEval(package);
				if (scoped_eval) {
					_eval = scoped_eval; //use scoped eval
					scope = package;
				} else {
					scope = "global[" + package + " not supported]";
				}
			} else if (package) {
				scope = "global[no " + package + " package]";
			}

			try {
				//run eval in package scope / fallback to eval in current scope (called global)
				result = _eval(expr);
			} catch (e) {
				//error in eval
				result = e;
			}

			ServerEval._results.insert({
				eval_time: eval_time,
				expr: expr,
				scope: scope,
				result: prettyResult(result)
			});
		},
		'serverEval/clear': function() {
			ServerEval._results.remove({});
		}
	});
}