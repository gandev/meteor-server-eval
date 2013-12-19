//create json from object, filters circular dependencies 
//and adds custom ____TYPE____ property
prettyResult = function(result) {
	if (!_.isObject(result)) {
		return result;
	}

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
			var err_msg = src_obj.toString();
			var err_msg_lines = err_msg.split("\n") || [err_msg];
			var stacktrace = src_obj.stack && src_obj.stack.split("\n") || [];
			dst_obj = {
				____TYPE____: '[Error]',
				err: err_msg,
				stack: stacktrace.slice(err_msg_lines.length)
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
				//remove futures, just because this info is pointless
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