/*
 * TroopJS data/query/component
 * @license MIT http://troopjs.mit-license.org/ © Mikael Karon mailto:mikael@karon.se
 */
define([ "troopjs-core/component/base" ], function QueryModule(Component) {
	"use strict";

	var UNDEFINED;
	var TRUE = true;
	var FALSE = false;
	var OBJECT = Object;
	var ARRAY = Array;
	var CONSTRUCTOR = "constructor";
	var LENGTH = "length";

	var OP = "op";
	var OP_ID = "!";
	var OP_PROPERTY = ".";
	var OP_PATH = ",";
	var OP_QUERY = "|";
	var TEXT = "text";
	var RAW = "raw";
	var RESOLVED = "resolved";
	var _ID = "id";
	var _EXPIRES = "expires";
	var _COLLAPSED = "collapsed";
	var _AST = "_ast";
	var _QUERY = "_query";

	var RE_TEXT = /("|')(.*?)\1/;
	var TO_RAW = "$2";
	var RE_RAW = /!(.*[!,|.\s]+.*)/;
	var TO_TEXT = "!'$1'";

	/**
	 * Component who understands the ubiquitous data query string format.
	 * @class data.query.component
	 * @extends core.component.base
	 */
	return Component.extend(function QueryComponent(query) {
		var me = this;

		if (query !== UNDEFINED) {
			me[_QUERY] = query;
		}
	}, {
		"displayName" : "data/query/component",

		/**
		 * Parse the query string.
		 * @param query
		 * @returns this
		 */
		"parse" : function parse(query) {
			var me = this;

			// Reset _AST
			delete me[_AST];

			// Set _QUERY
			query = me[_QUERY] = (query || me[_QUERY] || "");

			var i;          // Index
			var l;          // Length
			var c;          // Current character
			var m;          // Current mark
			var q;          // Current quote
			var o;          // Current operation
			var ast = [];   // _AST

			// Step through the query
			for (i = m = 0, l = query[LENGTH]; i < l; i++) {
				c = query.charAt(i);

				switch (c) {
					case "\"" : // Double quote
					/* falls through */
					case "'" :  // Single quote
						// Set / unset quote char
						q = q === c
							? UNDEFINED
							: c;
						break;

					case OP_ID :
						// Break fast if we're quoted
						if (q !== UNDEFINED) {
							break;
						}

						// Init new op
						o = {};
						o[OP] = c;
						break;

					case OP_PROPERTY :
					/* falls through */
					case OP_PATH :
						// Break fast if we're quoted
						if (q !== UNDEFINED) {
							break;
						}

						// If there's an active op, store TEXT and push on _AST
						if (o !== UNDEFINED) {
							o[RAW] = (o[TEXT] = query.substring(m, i)).replace(RE_TEXT, TO_RAW);
							ast.push(o);
						}

						// Init new op
						o = {};
						o[OP] = c;

						// Set mark
						m = i + 1;
						break;

					case OP_QUERY :
					/* falls through */
					case " " :  // Space
					/* falls through */
					case "\t" : // Horizontal tab
					/* falls through */
					case "\r" : // Carriage return
					/* falls through */
					case "\n" : // Newline
						// Break fast if we're quoted
						if (q !== UNDEFINED) {
							break;
						}

						// If there's an active op, store TEXT and push on _AST
						if (o !== UNDEFINED) {
							o[RAW] = (o[TEXT] = query.substring(m, i)).replace(RE_TEXT, TO_RAW);
							ast.push(o);
						}

						// Reset op
						o = UNDEFINED;

						// Set mark
						m = i + 1;
						break;
				}
			}

			// If there's an active op, store TEXT and push on _AST
			if (o !== UNDEFINED) {
				o[RAW] = (o[TEXT] = query.substring(m, l)).replace(RE_TEXT, TO_RAW);
				ast.push(o);
			}

			// Set _AST
			me[_AST] = ast;

			return me;
		},

		/**
		 * Further reduce the query string elements based on the cache content,
		 * to eliminate unnecessary queries made.
		 * @param {Object} cache The cache dictionary.
		 * @returns this
		 */
		"reduce" : function reduce(cache) {
			var me = this;
			var now = 0 | new Date().getTime() / 1000;

			// If we're not parsed - parse
			if (!(_AST in me)) {
				me.parse();
			}

			var ast = me[_AST]; // _AST
			var result = [];    // Result
			var i;              // Index
			var c;
			var l;              // Length
			var o;              // Current operation
			var n = null;          // Current node
			var d = FALSE;      // Dead flag
			var k = FALSE;      // Keep flag
			var r;              // Current root

			// check if the AST has expired on the current node
			function resolve_expire(ast, current_node) {
				var j;
				var x;              // Current raw
				var m;

				// Current node
				var n = current_node;
				switch (ast[OP]) {
					case OP_ID :

						// Set root only once
						if (!r) {
							r = ast;
						}

						// Get e from o
						x = ast[RAW];

						// Do we have this item in cache
						if (x in cache) {
							// Set current node
							n = cache[x];
							// Set dead and RESOLVED if we're not collapsed or expired
							d = ast[RESOLVED] =
							n[_COLLAPSED] !== TRUE && !(_EXPIRES in n && n[_EXPIRES] < now);
						} else {
							// Reset current root and node
							n = UNDEFINED;
							// Reset dead and RESOLVED
							d = ast[RESOLVED] = FALSE;
						}
						break;

					case OP_PROPERTY :
						// Get e from o
						x = ast[RAW];

						// Was previous op dead?
						if (!d) {
							ast[RESOLVED] = FALSE;
						}
						// property of an array, dive deep
						else if (n && n[CONSTRUCTOR] === ARRAY) {
							m = n;
							n = [];
							for (j = m[LENGTH]; j-- > 0;) {
								// Get item
								c = m[j];
								// spread over the all array item's property
								n = n.concat(resolve_expire(ast, c));
								if (!ast[RESOLVED]) {
									break;
								}
							}
							d = ast[RESOLVED];
						}
						// Do we have a node and this item in the node
						else if (n && x in n) {
							// Set current node
							n = n[x];

							// Get constructor
							c = n[CONSTRUCTOR];

							// If the constructor is an array
							if (c === ARRAY) {
								// Set naive resolved
								ast[RESOLVED] = TRUE;

								// Iterate backwards over n
								for (j = n[LENGTH]; j-- > 0;) {
									// Get item
									c = n[j];

									// If the constructor is not an object
									// or the object does not duck-type _ID
									// or the object is not collapsed
									// and the object does not duck-type _EXPIRES
									// or the objects is not expired
									if (c[CONSTRUCTOR] !== OBJECT
										|| !(_ID in c)
										|| c[_COLLAPSED] !== TRUE
										&& !(_EXPIRES in c && c[_EXPIRES] < now)) {
										continue;
									}

									// Change RESOLVED
									ast[RESOLVED] = FALSE;
									break;
								}
							}
							// If the constructor is _not_ an object or n does not duck-type _ID
							else if (c !== OBJECT || !(_ID in n)) {
								ast[RESOLVED] = TRUE;
							}
							// We know c _is_ and object and n _does_ duck-type _ID
							else {
								// Change OP to OP_ID
								ast[OP] = OP_ID;
								// Update RAW to _ID and TEXT to escaped version of RAW
								ast[TEXT] = (ast[RAW] = n[_ID]).replace(RE_RAW, TO_TEXT);
								// Set RESOLVED if we're not collapsed or expired
								ast[RESOLVED] =
								n[_COLLAPSED] !== TRUE && !(_EXPIRES in n && n[_EXPIRES] < now);
							}
						} else {
							// Reset current node and RESOLVED
							n = UNDEFINED;
							ast[RESOLVED] = FALSE;
						}
						break;

					case OP_PATH :
						// Get e from r
						x = r[RAW];

						// Set current node
						n = cache[x];

						// Change OP to OP_ID
						ast[OP] = OP_ID;

						// Copy properties from r
						ast[TEXT] = r[TEXT];
						ast[RAW] = x;
						ast[RESOLVED] = r[RESOLVED];
						break;
				}
				// return new current node
				return n;
			}

			// First step is to resolve what we can from the _AST
			for (i = 0, l = ast[LENGTH]; i < l; i++) {
				o = ast[i];
				n = resolve_expire(o, n);
			}

			// After that we want to reduce 'dead' operations from the _AST
			while (l-- > 0) {
				o = ast[l];

				switch(o[OP]) {
					case OP_ID :
						// If the keep flag is set, or the op is not RESOLVED
						if (k || o[RESOLVED] !== TRUE) {
							result.unshift(o);
						}

						// Reset keep flag
						k = FALSE;
						break;

					case OP_PROPERTY :
						result.unshift(o);

						// Set keep flag
						k = TRUE;
						break;
				}
			}

			// Update _AST
			me[_AST] = result;

			return me;
		},

		/**
		 * Retrieve the AST as the parsed result.
		 * @returns {Array} the result AST.
		 */
		"ast" : function ast() {
			var me = this;

			// If we're not parsed - parse
			if (!(_AST in me)) {
				me.parse();
			}

			return me[_AST];
		},

		/**
		 * Rebuild the (reduced) query string.
		 * @returns {String}
		 */
		"rewrite" : function rewrite() {
			var me = this;

			// If we're not parsed - parse
			if (!(_AST in me)) {
				me.parse();
			}

			var ast = me[_AST]; // AST
			var result = "";    // Result
			var l;              // Current length
			var i;              // Current index
			var o;              // Current operation

			// Step through AST
			for (i = 0, l = ast[LENGTH]; i < l; i++) {
				o = ast[i];

				switch(o[OP]) {
					case OP_ID :
						// If this is the first OP_ID, there's no need to add OP_QUERY
						result += i === 0
							? o[TEXT]
							: OP_QUERY + o[TEXT];
						break;

					case OP_PROPERTY :
						result += OP_PROPERTY + o[TEXT];
						break;
				}
			}

			return result;
		}
	});
});
