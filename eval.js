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
	//and adds custom ____TYPE____ property
	var prettyResult = function(obj) {
		if (!_.isObject(obj)) return obj;

		var cache = [];
		var current_path = [];

		var addToCache = function(value) {
			var cache_obj = {
				path: _.clone(current_path),
				value: value
			};
			cache.push(cache_obj);
			return cache_obj;
		};

		var cached = function(value) {
			return _.find(cache, function(obj) {
				return obj.value === value;
			});
		};

		//TODO investigate a more reliable solution
		var getConstructorName = function(obj) {
			var name = obj.constructor && obj.constructor.name;
			return name !== "Object" && name || "";
		};

		var formatObject = function(src_obj) {
			var dst_obj = _.isArray(src_obj) ? [] : {};

			if (getConstructorName(src_obj)) {
				dst_obj.____TYPE____ = "[Object][" + getConstructorName(src_obj) + "]";
			}

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
			var _cached;
			_.each(src_obj, function(value, key) {
				current_path.push(key);

				_cached = cached(value);
				if (_cached) {
					//remove futures!? TODO consider
					if (key !== "future") {
						// Circular reference found
						dst_obj[key] = {
							____TYPE____: '[Circular]',
							path: _cached.path.join(".")
						};

						if (!_cached.shortest_path && _cached.path.length > current_path.length ||
							_cached.shortest_path && _cached.shortest_path.length > current_path.length) {
							//no shortest path and current path shorter than cached or
							//shortest path greater than current
							_cached.shortest_path = _.clone(current_path);
						}
					}
				} else {
					if (_.isObject(value)) {
						_cached = addToCache(value);
						dst_obj[key] = formatObject(value);
						_cached.formatted_value = dst_obj[key];
					} else {
						dst_obj[key] = value;
					}
				}

				current_path.pop();
			});
			return dst_obj;
		};
		var nicer_obj = formatObject(obj);

		current_path = [];
		var reorganizeCirculars = function() {
			//sort cache longest paths first
			cache = _.sortBy(cache, function(cached_value) {
				return -cached_value.path.length;
			});
			_.each(cache, function(cached_value) {
				var shortest = cached_value.shortest_path;
				if (!shortest) return; //already the shortest path

				var formatted = cached_value.formatted_value;
				var circular = {
					____TYPE____: '[Circular]',
					path: shortest.join(".")
				};

				var patchCirculars = function(_obj) {
					_.each(_obj, function(value, key) {
						current_path.push(key);

						if (_.isObject(value)) {
							if (_obj !== formatted && value.____TYPE____ === '[Circular]' &&
								_.isEqual(current_path, shortest)) {
								_obj[key] = formatted;
							} else if (_.isEqual(cached_value.path, current_path) ||
								value.____TYPE____ === '[Circular]' &&
								_.isEqual(value.path.split("."), cached_value.path)) {
								_obj[key] = circular;
							} else if (value.____TYPE____ === '[Circular]' &&
								value.path.indexOf(cached_value.path.join(".")) === 0) {
								value.path = value.path.replace(cached_value.path.join("."), shortest.join("."));
							} else {
								patchCirculars(value);
							}
						}

						current_path.pop();
					});
				};
				patchCirculars(formatted);
				patchCirculars(nicer_obj);
			});
		};
		reorganizeCirculars();

		return nicer_obj;
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
			var _eval = function(expr) {
				return eval(expr); //TODO investigate, without wrapping function other scope
			};

			//determine scope
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