define([ "../component/service", "troopjs-core/pubsub/topic", "../data/cache", "troopjs-core/util/deferred", "troopjs-core/util/merge"], function QueryModule(Service, Topic, cache, Deferred, merge) {
	var UNDEFINED = undefined;
	var ARRAY_PROTO = Array.prototype;
	var SLICE = ARRAY_PROTO.slice;
	var CONCAT = ARRAY_PROTO.concat;
	var PUSH = ARRAY_PROTO.push;
	var LENGTH = "length";
	var BATCHES = "batches";
	var INTERVAL = "interval";

	return Service.extend(function QueryService() {
		this[BATCHES] = [];
	}, {
		displayName : "ef/service/query",

		"sig/start" : function start(signal, deferred) {
			var self = this;

			// Only do this if we don't have an interval already
			if (!(INTERVAL in self)) {
				// Set interval
				self[INTERVAL] = setInterval(function batchInterval() {
					var batches = self[BATCHES];

					// Return fast if there is nothing to do
					if (batches[LENGTH] === 0) {
						return;
					}

					// Reset batches
					self[BATCHES] = [];

					Deferred(function deferredRequest(dfdRequest) {
						var q = [];
						var topics = [];
						var dfd;
						var i;
						var iMax;

						// Step through batches
						for (i = 0, iMax = batches[LENGTH]; i < iMax; i++) {
							// Get dfd
							dfd = batches[i];

							// Add dfd.topic to topics
							PUSH.call(topics, dfd.topic);

							// Add dfd.q to q
							PUSH.apply(q, dfd.q);
						}

						// No q, might as well resolve
						if (q[LENGTH] === 0) {
							dfdRequest.resolve(q);
						}
						// Otherwise request from backend
						else {
							// Publish ajax
							self.publish(Topic("ajax", self, topics), merge.call({
								"data": {
									"q": q.join("|")
								}
							}, self.config.api.query), dfdRequest);
						}
					})
					.done(function requestDone(data, textStatus, jqXHR) {
						var dfd;
						var guid;
						var guids;
						var queries;
						var i;
						var j;
						var iMax;
						var jMax;

						// Add all new data to cache
						cache.put(data);

						// Step through batches
						for (i = 0, iMax = batches[LENGTH]; i < iMax; i++) {
							// Get deferred
							dfd = batches[i];

							// Get queries
							queries = dfd.queries;

							// Get guids
							guids = dfd.guids;

							// Fill queries from cache
							for (j = 0, jMax = guids[LENGTH]; j < jMax; j++) {
								guid = guids[j];

								if (guid !== UNDEFINED) {
									queries[j] = cache[guid];
								}
							}

							// Resolve original deferred
							dfd.resolve.apply(dfd, queries);
						}
					})
					.fail(function requestFail() {
						var i;
						var iMax;
						var dfd;

						// Step through deferred
						for (i = 0, iMax = batches[LENGTH]; i < iMax; i++) {
							// Get deferred
							dfd = batches[i];

							// Reject (with original queries as argument)
							dfd.reject.apply(dfd, dfd.queries);
						}
					});
				}, 200);
			}

			if (deferred) {
				deferred.resolve();
			}
		},

		"sig/stop" : function stop(signal, deferred) {
			var self = this;

			// Only do this if we have an interval
			if (INTERVAL in self) {
				// Clear interval
				clearInterval(self[INTERVAL]);
	
				// Reset interval
				delete self[INTERVAL];
			}

			if (deferred) {
				deferred.resolve();
			}
		},

		"hub/query" : function query(topic /* query, query, query, .., */, deferred) {
			var self = this;
			var length = arguments.length - 1;
			var batches = self[BATCHES];

			// Update (multi) query
			var queries = CONCAT.apply(ARRAY_PROTO, SLICE.call(arguments, 1, length));

			// Update deferred
			deferred = arguments[length];

			// Deferred query
			Deferred(function deferredQuery(dfd) {
				var re = /^(\w+![\w\d\-_;]+)/;
				var matches;
				var query;

				// Create guids
				var guids = dfd.guids = [];
				// Create q
				var q = dfd.q = [];
				// Get queries length
				var i = queries.length;

				while (i--) {
					// Get query
					query = queries[i];

					// Check if this was a valid query
					if (matches = re.exec(query)) {
						// Update guids
						guids[i] = matches[1];

						// Push query to q
						q.push(query);
					}
					else {
						// Otherwise just store UNDEFINED at i
						guids[i] = UNDEFINED;
					}
				}

				// Store original topic and queries
				dfd.topic = topic;
				dfd.queries = queries;

				// Add dfd to batches
				batches.push(dfd);
			})
			.then(deferred.resolve, deferred.reject);
		}
	});
});