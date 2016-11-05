// ChatSetAttr version 1.1.1
// Last Updated: 2016-11-4
// A script to create, modify, or delete character attributes from the chat area or macros.
// If you don't like my choices for --replace, you can edit the replacers variable at your own peril to change them.

var chatSetAttr = chatSetAttr || (function() {
	'use strict';

	const version = '1.1.1',
	replacers = [ ['<', '[', /</g, /\[/g],
				['>',']' , />/g, /\]/g],
				['#','|', /#/g, /\|/g],
				['~','-', /\~/g, /\-/g],
				[';','?', /\;/g, /\?/g],
				['`','@', /`/g, /@/g]],

	checkInstall = function() {
		log(`-=> ChatSetAttr v${version} <=-`);
	},

	handleErrors = function(who, errors) {
		if (errors.length) {
			let output = `/w "${who}" <div style="border: 1px solid black;`
				+ `background-color: #FFBABA; padding: 3px 3px;">`
				+ `<h4>Errors</h4><p>${errors.join('</p><p>')}</p></div>`;
			sendChat('ChatSetAttr', output);
			errors.splice(0, errors.length);
		}
	},

	getPlayerName = function(who) {
		let match = who.match(/(.*) \(GM\)/);
		return (match) ? (match[1] || 'GM') : who;
	},

	escapeRegExp = function (str) {
		return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
	},

	processInlinerolls = function (msg) {
		// Input:	msg - chat message
		// Output:	msg.content, with all inline rolls evaluated
		if (_.has(msg, 'inlinerolls')) {
			return _.chain(msg.inlinerolls)
					.reduce(function(previous, current, index) {
						previous['$[[' + index + ']]'] = current.results.total || 0;
						return previous;
					},{})
					.reduce(function(previous, current, index) {
						return previous.replace(index, current);
					}, msg.content)
					.value();
		} else {
			return msg.content;
		}
	},

	getCIKey = function (obj, name) {
		let nameLower = name.toLowerCase(), result = false;
		_.each(obj, function (v,k) {
			if (k.toLowerCase() === nameLower) {
				result = k;
			}
		});
		return result;
	},

	// Getting attributes from parsed options. Repeating attributes need special treatment
	// in order to parse row index and not create defective repeating rows.
	getRepeatingAttributes = function(list, setting, errors, createMissing, failSilently) {
		let allAttrs = {}, allKeys = _.keys(setting), indexMatch, attrNameSplit, id, name,
			repeatingTypeStart, allSectionAttrs, repSectionIds, rowNum, rowId, idMatch,
			repSectionIdsLower, realRepName;

		list.forEach(function(charid) {
			allAttrs[charid] = {};
		});

		_.each(allKeys, function(attrName) {
			indexMatch = attrName.match(/_\$(\d+)_/);
			allSectionAttrs = {}, repSectionIds = {}, repSectionIdsLower = {};

			_.each(list, function(charid) {
				allSectionAttrs[charid] = {};
			});

			if (indexMatch) {
				rowNum = parseInt(indexMatch[1]);
				attrNameSplit = attrName.split(indexMatch[0]);
			} else {
				idMatch = attrName.match(/_(-[-A-Za-z0-9]+?|\d+)_/);
				if (idMatch) {
					rowId = idMatch[1].toLowerCase();
					attrNameSplit = attrName.split(idMatch[0]);
				} else {
					errors.push(`Could not understand repeating attribute name`
						+ ` ${attrName}.`);
					return;
				}
			}

			repeatingTypeStart = new RegExp('^' + escapeRegExp(attrNameSplit[0])
				+ '_(-[-A-Za-z0-9]+?|\\d+)_','i');

			filterObjs(function(o) {
				if (o.get('_type') === 'attribute') {
					id = o.get('_characterid');
					name = o.get('name');
					if (_.contains(list,id) && name.search(repeatingTypeStart) !== -1) {
						allSectionAttrs[id][name] = o;
						return true;
					}
				}
			});

			_.each(list, function(charid) {
				repSectionIds[charid] = _.chain(allSectionAttrs[charid])
					.map((o,n) => n.match(repeatingTypeStart))
					.compact()
					.map(a => a[1])
					.uniq()
					.value();
				if (!indexMatch) {
					repSectionIdsLower[charid] = _.map(repSectionIds[charid],
						 n => n.toLowerCase());
				}
			});

			_.each(list, function(charid) {
				if (indexMatch && !_.isUndefined(repSectionIds[charid][rowNum])) {
					realRepName = attrNameSplit[0] + '_' + repSectionIds[charid][rowNum]
						+ '_' + attrNameSplit[1];
				} else if (!indexMatch && _.contains(repSectionIdsLower[charid], rowId)) {
					realRepName = attrNameSplit[0] + '_'
						+ repSectionIds[charid][_.indexOf(repSectionIdsLower[charid], rowId)]
						+ '_' + attrNameSplit[1];
				} else if (indexMatch) {
					errors.push(`Row number ${rowNum} invalid for character`
						+ ` ${getAttrByName(charid,'character_name')}`
						+ ` and repeating section ${attrNameSplit[0]}.`);
					return;
				} else {
					errors.push(`Repeating section id ${rowId} invalid for character`
						+ ` ${getAttrByName(charid,'character_name')}`
						+ ` and repeating section ${attrNameSplit[0]}.`);
					return;
				}
				let nameCI = getCIKey(allSectionAttrs[charid], realRepName);
				if (nameCI) {
					allAttrs[charid][attrName] = allSectionAttrs[charid][nameCI];
				} else if (createMissing) {
					allAttrs[charid][attrName] = createObj('attribute',
						{characterid: charid , name: realRepName});
				} else if (!failSilently) {
					errors.push(`Missing attribute ${realRepName} not created for`
						+ ` character ${getAttrByName(charid,'character_name')}.`);
				}
			});
		});
		return allAttrs;
	},

	getStandardAttributes = function(list, setting, errors, createMissing, failSilently) {
		let allAttrs = {}, allKeys = _.keys(setting), allKeysUpper, id, name;

		allKeysUpper = allKeys.map(x => x.toUpperCase());

		list.forEach(function(charid) {
			allAttrs[charid] = {};
		});

		filterObjs(function(o) {
			if (o.get('_type') === 'attribute') {
				id = o.get('_characterid');
				name = o.get('name');
				if (_.contains(list,id) && _.contains(allKeysUpper,name.toUpperCase())) {
					allAttrs[id][allKeys[_.indexOf(allKeysUpper, name.toUpperCase())]] = o;
					return true;
				}
			}
		});

		list.forEach(function(charid) {
			_.each(_.difference(allKeys, _.keys(allAttrs[charid])), function (key) {
				if (createMissing) {
					allAttrs[charid][key] = createObj('attribute', {characterid: charid , name: key});
				}
				else if (!failSilently) {
					errors.push(`Missing attribute ${key} not created for character`
					+ ` ${getAttrByName(charid,'character_name')}.`);
				}
			});
		});

		return allAttrs;
	},

	getAllAttributes = function(list, setting, errors, createMissing, failSilently) {
		let settingRepeating = _.pick(setting, (v,k) =>	(k.search(/^repeating_/) !== -1));
		let settingStandard = _.omit(setting, _.keys(settingRepeating));
		let standardAttrs = getStandardAttributes(list, settingStandard, errors, createMissing, failSilently);
		let repeatingAttrs = getRepeatingAttributes(list, settingRepeating, errors, createMissing, failSilently);
		let allAttrs = {};

		_.each(list, function(charid) {
			allAttrs[charid] = _.defaults(standardAttrs[charid],repeatingAttrs[charid]);
		});
		return allAttrs;
	},

	// Setting attributes happens in a delayed recursive way to prevent the sandbox
	// from overheating.
	delayedSetAttributes = function(who, list, setting, errors, allAttrs, fillInAttrs, opts) {
		let cList = _.clone(list), feedback = [],
			dWork = function(charid) {
				setCharAttributes(charid, setting, errors, feedback, allAttrs[charid],
					fillInAttrs, opts);
				if (cList.length) {
					_.delay(dWork, 50, cList.shift());
				} else {
					handleErrors(who, errors);
					if (!opts.silent) {
						sendFeedback(who, feedback, opts);
					}
				}
			}
		dWork(cList.shift());
	},

	setCharAttributes = function(charid, setting, errors, feedback, attrs, fillInAttrs, opts) {
		let charFeedback = {};
		_.chain(setting)
		.pick(_.keys(attrs))
		.each(function (attrValue,attrName) {
			let attr = attrs[attrName];

			let attrNew = (fillInAttrs[attrName]) ?
				_.mapObject(attrValue, v => fillInAttrValues(charid, v)) : _.clone(attrValue);

			if (opts.evaluate) {
				try {
					attrNew = _.mapObject(attrNew, function (v) {
						let parsed = eval(v);
						if (!_.isNaN(parsed) && !_.isUndefined(parsed)) {
							return parsed.toString();
						}
						else return v;
					});
				}
				catch(err) {
					errors.push(`Something went wrong with --evaluate.`
						+ ` You were warned. The error message was: ${err}.`);
				}
			}

			if (opts.mod || opts.modb) {
				_.each(attrNew, function(v,k) {
					let moddedValue = parseFloat(v) + parseFloat(attr.get(k) || '0');
					if (!_.isNaN(moddedValue)) {
						if (opts.modb && k === 'current') {
							moddedValue = Math.min(Math.max(moddedValue, 0),
								parseFloat(attr.get('max') || Infinity));
						}
						attrNew[k] = moddedValue.toString();
					}
					else {
						delete attrNew[k];
						let type = (k === 'max') ? 'maximum ' : '';
						errors.push(`Attribute ${type}${attrName} is not number-valued`
							+ ` for character ${getAttrByName(charid,'character_name')}`
							+ `. Attribute ${type}left unchanged.`);
					}
				});
			}

			charFeedback[attrName] = attrNew;
			attr.set(attrNew);
// 			attr.setWithWorker(attrNew);
		});
		// Feedback
		charFeedback = _.chain(charFeedback)
			.mapObject(function (o,k,l) {
				if (!_.isUndefined(o.max) && !_.isUndefined(o.current))
					return `${o.current || '<i>(empty)</i>'} / ${o.max || '<i>(empty)</i>'}`;
				else if (!_.isUndefined(o.current)) return o.current || '<i>(empty)</i>';
				else if (!_.isUndefined(o.max)) return `${o.max || '<i>(empty)</i>'} (max)`;
				else return null;
			})
			.omit(_.isNull)
			.mapObject(function(str) {
				if (opts.replace) {
					_.each(replacers, function (rep) {str = str.replace(rep[3],rep[0]);});
				}
				return str;
			})
			.value();
		if (!_.isEmpty(charFeedback)) {
			feedback.push(`Setting ${_.keys(charFeedback).join(', ')} to`
				+ ` ${_.values(charFeedback).join(', ')} for character`
				+ ` ${getAttrByName(charid, 'character_name')}.`);
		} else {
			feedback.push(`Nothing to do for character`
				+ ` ${getAttrByName(charid, 'character_name')}.`);
		}
		return;
	},

	fillInAttrValues = function(charid, expression) {
		let match = expression.match(/%(\S.*?)(?:_(max))?%/), replacer;
		while (match) {
			replacer = getAttrByName(charid, match[1], match[2] || 'current') || '';
			expression = expression.replace(/%(\S.*?)(?:_(max))?%/, replacer);
			match = expression.match(/%(\S.*?)(?:_(max))?%/);
		}
		return expression;
	},

	deleteAttributes = function (who, allAttrs, silent) {
		let feedback = {};
		_.each(allAttrs, function(charAttrs, charid) {
			feedback[charid] = [];
			_.each(charAttrs, function(attr, name) {
				attr.remove();
				feedback[charid].push(name);
			});
		});
		silent ? null : sendDeleteFeedback(who, feedback);
	},

	//  These functions parse the chat input.
	parseOpts = function(content, hasValue) {
		// Input:	content - string of the form command --opts1 --opts2  value --opts3.
		//					values come separated by whitespace.
		//			hasValue - array of all options which come with a value
		// Output:	object containing key:true if key is not in hasValue. and containing
		//			key:value otherwise
		let args, kv, opts = {};
		args = _.rest(content.replace(/<br\/>\n/g, ' ')
				.replace(/\s*$/g, '')
				.replace(/({{(.*?)\s*}}$)/g, '$2')
				.split(/\s+--/));
		for (let k in args) {
			kv = args[k].split(/\s(.+)/);
			if (_.contains(hasValue, kv[0])) {
				opts[kv[0]] = kv[1];
			} else {
				opts[args[k]] = true;
			}
		}
		return opts;
	},

	parseAttributes = function(args, replace, fillInAttrs) {
		// Input:	args - array containing comma-separated list of strings, every one of which contains
		//			an expression of the form key|value or key|value|maxvalue
		//			replace - true if characters from the replacers array should be replaced
		// Output:	Object containing key|value for all expressions.
		let setting =  _.chain(args)
						.map(str => str.split(/\s*\|\s*/))
						.reject(a => a.length === 0)
						.map(sanitizeAttributeArray)
						.reduce(function (p,c) {
							p[c[0]] = _.extend(p[c[0]] || {}, c[1])
							return p;
						},{})
						.value();

		if (replace) {
			setting = _.mapObject(setting, function(obj) {
				return _.mapObject(obj, function (str) {
					_.each(replacers, function (rep) {
						str = str.replace(rep[2],rep[1]);
					});
					return str;
				});
			});
		}

		_.extend(fillInAttrs, _.mapObject(setting, obj =>
			(obj.current && obj.current.search(/%(\S.*?)(?:_(max))?%/) !== -1)
			|| (obj.max && obj.max.search(/%(\S.*?)(?:_(max))?%/) !== -1)
		));
		return setting;
	},

	sanitizeAttributeArray = function (arr) {
		if (arr.length === 1)
			return [arr[0],{current : ''}];
		if (arr.length === 2)
			return [arr[0],{current : arr[1].replace(/^'(.*)'$/,'$1')}];
		if (arr.length === 3 && arr[1] === '')
			return [arr[0], {max : arr[2].replace(/^'(.*)'$/,'$1')}];
		if (arr.length === 3 && arr[1] === "''")
			return [arr[0], {current : '', max : arr[2].replace(/^'(.*)'$/,'$1')}];
		else if (arr.length === 3)
			return [arr[0], {current : arr[1].replace(/^'(.*)'$/,'$1'), max : arr[2].replace(/^'(.*)'$/,'$1')}];
		if (arr.length > 3) return sanitizeAttributeArray(_.first(arr,3));
	},

	// These functions are used to get a list of character ids from the input,
	// and check for permissions.
	checkPermissions = function (list, errors, playerid) {
		let control, character, remove = [];
		_.each(list, function (id, k) {
			character = getObj('character', id);
			if (character) {
				control = character.get('controlledby').split(/,/);
				if(!(playerIsGM(playerid) || _.contains(control,'all') || _.contains(control,playerid))) {
					remove.push(k);
					errors.push(`Permission error for character ${character.get('name')}.`);
				}
			} else {
				errors.push(`Invalid character id ${id}.`);
				remove.push(k);
			}
		});
		_.each(remove.reverse(), i => list.splice(i,1));
		return list;
	},

	getIDsFromTokens = function (selected) {
		return _.chain(selected)
				.map(obj => getObj('graphic', obj._id))
				.compact()
				.map(token => token.get('represents'))
				.compact()
				.filter(id => getObj('character', id))
				.uniq()
				.value();
	},

	getIDsFromNames = function(charNames, errors, playerid) {
		let charIDList =   _.chain(charNames.split(/\s*,\s*/))
							.map(n => [n, findObjs({type: 'character', name: n},
								{caseInsensitive: true})[0]])
							.each(function (arr) {
								_.isUndefined(arr[1]) ? errors.push('No character named '
									+ arr[0] + ' found.') : null;
							})
							.map(arr => arr[1])
							.compact()
							.map(c => c.id)
							.uniq()
							.value();
		return checkPermissions(charIDList, errors, playerid);
	},

	getIDsFromList = function(charid, errors, playerid) {
		return checkPermissions(_.uniq(charid.split(/\s*,\s*/)), errors, playerid);
	},

	sendFeedback = function(who, feedback, opts) {
		let output = `/w "${who}" <div style="border: 1px solid black; background-color:`
		 	+ ' #FFFFFF; padding: 3px 3px;"><h3>Setting attributes</h3><p>';
		output += feedback.join('<br>') || 'Nothing to do.';
		if (opts.replace) {
			output += `</p><p>(replacing ${_.map(replacers, arr => arr[0]).join()} by`
				+ ` ${_.map(replacers, arr => arr[1]).join()})`;
		}
		output += '</p></div>';
		sendChat('ChatSetAttr', output);
	},

	sendDeleteFeedback = function (who, feedback) {
		let output = `/w "${who}" <div style="border: 1px solid black; background-color:`
		 	+ ' #FFFFFF; padding: 3px 3px;"><h3>Deleting attributes</h3><p>';
		output += _.chain(feedback)
			.omit(arr => _.isEmpty(arr))
			.map(function (arr,id) {
				return `Deleting attribute(s) ${arr.join(', ')} for character`
					+ ` ${getAttrByName(id, 'character_name')}.`;
			})
			.join('</p><p>')
			.value() || 'Nothing to do.';
		output += '</p></div>';
		sendChat('ChatSetAttr', output);
	},

	// Main function, called after chat message input
	handleInput = function(msg) {
		if (msg.type !== 'api') {
			return;
		}
		let mode = msg.content.match(/^!(set|del)attr\b/);
		if (mode) {
			// Parsing input
			let charIDList = [], fillInAttrs = {}, errors = [];
			const hasValue = ['charid','name'],
				optsArray = ['all','allgm','charid','name','silent','sel',
					'replace', 'nocreate','mod','modb','evaluate'],
				who = getPlayerName(msg.who),
				opts = parseOpts(processInlinerolls(msg),hasValue),
				setting = parseAttributes(_.chain(opts).omit(optsArray).keys().value(),
					opts.replace, fillInAttrs),
				deleteMode = (mode[1] === 'del');

			if (opts.evaluate && !playerIsGM(msg.playerid)) {
				handleErrors(who, ['The --evaluate option is only available to the GM.']);
				return;
			}

			// Get list of character IDs
			if (opts.all && playerIsGM(msg.playerid)) {
				charIDList = _.map(findObjs({_type: 'character'}), c => c.id);
			} else if (opts.allgm && playerIsGM(msg.playerid)) {
				charIDList = _.chain(findObjs({_type: 'character'}))
							.filter(c => c.get('controlledby') === '')
							.map(c => c.id)
							.value();
			} else if (opts.charid) {
				charIDList = getIDsFromList(opts.charid, errors, msg.playerid);
			} else if (opts.name) {
				charIDList = getIDsFromNames(opts.name, errors, msg.playerid);
			} else if (opts.sel) {
				charIDList = getIDsFromTokens(msg.selected);
			} else {
				errors.push('You need to supply one of --all, --allgm, --sel,'
					+ ' --charid, or --name.');
			}
			if (_.isEmpty(charIDList)) {
				errors.push('No target characters.');
			}
			if (_.isEmpty(setting)) {
				errors.push('No attributes supplied.');
			}

			// Get attributes
			let allAttrs = getAllAttributes(charIDList, setting, errors, !opts.nocreate && !deleteMode, deleteMode);
			handleErrors(who, errors);

			// Set or delete attributes
			if (!_.isEmpty(charIDList) && !_.isEmpty(setting)) {
				if (deleteMode) {
					deleteAttributes(who, allAttrs, opts.silent);
				} else {
					delayedSetAttributes(who, charIDList, setting, errors, allAttrs,
						fillInAttrs, _.pick(opts, optsArray));
				}
			}
		}
		return;
	},

	registerEventHandlers = function() {
		on('chat:message', handleInput);
	};

	return {
		CheckInstall: checkInstall,
		RegisterEventHandlers: registerEventHandlers
	};
}());

on('ready',function() {
	'use strict';

	chatSetAttr.CheckInstall();
	chatSetAttr.RegisterEventHandlers();
});
