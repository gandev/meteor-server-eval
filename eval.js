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
	ServerEval._metadata = new Meteor.Collection("server-eval-metadata", {
		connection: null // not persistent
	});
	Meteor.publish("server-eval-metadata", function() {
		return ServerEval.metadata();
	});

	ServerEval._results = new Meteor.Collection("server-eval-results", {
		connection: null // not persistent
	});
	Meteor.publish("server-eval-results", function() {
		return ServerEval.results();
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
	var prettyResult = function(result) {
		if (!_.isObject(result)) return result;

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

						//TODO prioritize e.g. Meteor as shortest Path !?
						if (!_cached.shortest_path && _cached.path.length > current_path.length ||
							_cached.shortest_path && _cached.shortest_path.length > current_path.length) {
							//no shortest path and current path shorter than cached or
							//shortest path greater than current
							_cached.shortest_path = _.clone(current_path);
						}
					}
				} else {
					var current_path_joined = current_path.join(".");
					if ( /* in collection cursor */
						current_path_joined.indexOf("ServerEval._results._collection") >= 0 && key === "docs" ||
						/* in Meteor.server.sessions */
						current_path_joined.indexOf("collectionViews.server-eval-results") >= 0 && key === "documents") {
						//evaluating ServerEval (e.g. with Meteor, Package, ServerEval, ...)
						//ends up adding all results multiple times to the result and again
						//so it's important to toss them away
						//TODO maybe toss all internals away like metadata but i wan't to remove as little as possible
						//TODO also consider someone evaluating these things without context... maybe dont allow in Console!?
						dst_obj[key] = {
							____TYPE____: '[Internal]'
						};
					} else if (_.isObject(value)) {
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
		var nicer_obj = formatObject(result);

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
								//patch formatted value in shortest path
								_obj[key] = formatted;
							} else if (_.isEqual(cached_value.path, current_path) ||
								value.____TYPE____ === '[Circular]' &&
								_.isEqual(value.path.split("."), cached_value.path)) {
								//patch all occurences of the cached circular with shortest path (old value included)
								_obj[key] = circular;
							} else if (value.____TYPE____ === '[Circular]' &&
								value.path.indexOf(cached_value.path.join(".")) === 0) {
								//replace circulars starting with cached path with shortest path
								value.path = value.path.replace(cached_value.path.join("."), shortest.join("."));
							} else {
								//recursive call with other objects
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
		//console.time("pretty-print-time");
		reorganizeCirculars();
		//console.timeEnd("pretty-print-time");
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
			var scope = "server-eval";
			var result;
			var _eval = function(expr) {
				//TODO investigate, without wrapping function other scope e.g. Npm undefined
				return eval(expr);
			};

			//determine scope
			if (Package[package]) {
				var scoped_eval = findEval(package);
				if (scoped_eval) {
					_eval = scoped_eval; //use scoped eval
					scope = package;
				} else {
					scope = "server-eval[" + package + " not supported]";
				}
			} else if (package) {
				scope = "server-eval[no " + package + " package]";
			}

			var eval_exec_time = Date.now();
			try {
				//run eval in package scope / fallback to eval in current scope
				result = _eval(expr);
			} catch (e) {
				//error in eval
				result = e;
			}
			eval_exec_time = Date.now() - eval_exec_time;

			//TODO get rid of some data automatically!?
			//because of serious performance issue with really big results
			//
			//console.time("insert new result time");
			ServerEval._results.insert({
				eval_time: eval_time,
				eval_exec_time: eval_exec_time,
				expr: expr,
				scope: scope,
				result: prettyResult(result)
			});
			//console.timeEnd("insert new result time");
		},
		'serverEval/clear': function() {
			ServerEval._results.remove({});
		}
	});
}