/**
 * TroopJS data/query/service
 * @license MIT http://troopjs.mit-license.org/ © Mikael Karon mailto:mikael@karon.se
 */
/*global define:false */
define([ "module", "troopjs-core/component/service", "./component", "when", "troopjs-utils/merge" ], function QueryServiceModule(module, Service, Query, when, merge) {
	/*jshint laxbreak:true */

	var UNDEFINED;
	var ARRAY_PROTO = Array.prototype;
	var ARRAY_SLICE = ARRAY_PROTO.slice;
	var ARRAY_CONCAT = ARRAY_PROTO.concat;
	var PUSH = ARRAY_PROTO.push;
	var LENGTH = "length";
	var BATCHES = "batches";
	var INTERVAL = "interval";
	var CACHE = "cache";
	var QUERY = "query";
	var TOPIC = "topic";
	var QUERIES = "queries";
	var RESOLVED = "resolved";
	var CONFIGURATION = "configuration";
	var RAW = "raw";
	var ID = "id";
	var Q = "q";
	var MODULE_CONFIG = module.config();

	return Service.extend(function QueryService(cache) {
		var self = this;

		if (cache === UNDEFINED) {
			throw new Error("No cache provided");
		}

		self[BATCHES] = [];
		self[CACHE] = cache;

		self.configure(MODULE_CONFIG);
	}, {
		"displayName" : "data/query/service",

		"sig/start" : function start() {
			var self = this;
			var cache = self[CACHE];

			// Set interval (if we don't have one)
			self[INTERVAL] = INTERVAL in self
				? self[INTERVAL]
				: setInterval(function scan() {
				var batches = self[BATCHES];

				// Return fast if there is nothing to do
				if (batches[LENGTH] === 0) {
					return;
				}

				// Reset batches
				self[BATCHES] = [];

				function request() {
					var q = [];
					var batch;
					var i;

					// Iterate batches
					for (i = batches[LENGTH]; i--;) {
						batch = batches[i];

						// Add batch[Q] to q
						PUSH.apply(q, batch[Q]);
					}

					// Publish ajax
					return self.publish("ajax", merge.call({
						"data": {
							"q": q.join("|")
						}
					}, self[CONFIGURATION]));
				}

				function done(data) {
					var batch;
					var queries;
					var id;
					var i;
					var j;

					// Add all new data to cache
					cache.put(data);

					// Iterate batches
					for (i = batches[LENGTH]; i--;) {
						batch = batches[i];
						queries = batch[QUERIES];
						id = batch[ID];

						// Iterate queries
						for (j = queries[LENGTH]; j--;) {
							// If we have a corresponding ID, fetch from cache
							if (j in id) {
								queries[j] = cache[id[j]];
							}
						}

						// Resolve batch
						batch.resolve(queries);
					}
				}

				function fail() {
					var batch;
					var i;

					// Iterate batches
					for (i = batches[LENGTH]; i--;) {
						batch = batches[i];

						// Reject (with original queries as argument)
						batch.reject(batch[QUERIES]);
					}
				}

				// Request and handle response
				request().then(done, fail);
			}, 200);
		},

		"sig/stop" : function stop() {
			var self = this;

			// Only do this if we have an interval
			if (INTERVAL in self) {
				// Clear interval
				clearInterval(self[INTERVAL]);

				// Reset interval
				delete self[INTERVAL];
			}
		},

		"hub/query" : function hubQuery(topic /* query, query, query, .., */) {
			var self = this;
			var batches = self[BATCHES];
			var cache = self[CACHE];
			var q = [];
			var id = [];
			var ast;
			var i;
			var j;
			var iMax;
			var queries;
			var query;

			// Create deferred batch
			var ret = when.defer();
			var deferred = when.defer();
			var resolver = deferred.resolver;

			// resolve ret when deferred is done
			ret.resolver.resolve(deferred.promise);

			try {
				// Slice and flatten queries
				queries = ARRAY_CONCAT.apply(ARRAY_PROTO, ARRAY_SLICE.call(arguments, 1));

				// Iterate queries
				for (i = 0, iMax = queries[LENGTH]; i < iMax; i++) {
					// Init Query
					query = Query(queries[i]);

					// Get AST
					ast = query.ast();

					// If we have an ID
					if (ast[LENGTH] > 0) {
						// Store raw ID
						id[i] = ast[0][RAW];
					}

					// Get reduced AST
					ast = query.reduce(cache).ast();

					// Step backwards through AST
					for (j = ast[LENGTH]; j-- > 0;) {
						// If this op is not resolved
						if (!ast[j][RESOLVED]) {
							// Add rewritten (and reduced) query to q
							PUSH.call(q, query.rewrite());
							break;
						}
					}
				}

				// If all queries were fully reduced, we can quick resolve
				if (q[LENGTH] === 0) {
					// Iterate queries
					for (i = 0; i < iMax; i++) {
						// If we have a corresponding ID, fetch from cache
						if (i in id) {
							queries[i] = cache[id[i]];
						}
					}

					// Resolve batch resolver
					resolver.resolve(queries);
				}
				else {
					// Store properties on batch
					resolver[QUERIES] = queries;
					resolver[ID] = id;
					resolver[Q] = q;

					// Add batch to batches
					batches.push(resolver);
				}
			}
			catch (e) {
				resolver.reject(e);
			}

			// Return promise
			return ret
				.promise
				.spread(function(){
					// add topic to be the first argument
					var args = ARRAY_SLICE.call(arguments, 0);
					args.unshift(QUERY);
					return args;
				});
		}
	});
});
