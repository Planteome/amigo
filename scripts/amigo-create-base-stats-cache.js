////
////
//// Essentially run as:
////  node ./scripts/amigo-create-base-stats-cache.js
////  node ./scripts/amigo-create-base-stats-cache.js --from-date 20150401 --to-date 20160331
////  node ./scripts/amigo-create-base-stats-cache.js --server http://golr.geneontology.org/
////

var us = require('underscore');
var bbop = require('bbop-core');
var fs = require('fs');

//var amigo = new (require('amigo2-instance-data'))();
var amigo = new (require('../javascript/npm/amigo2-instance-data'))();

var golr_conf = require('golr-conf');
var gconf = new golr_conf.conf(amigo.data.golr);
var sd = amigo.data.server;
var gserv = amigo.data.server.golr_base;

var node_engine = require('bbop-rest-manager').node;
var golr_manager = require('bbop-manager-golr');
var golr_response = require('bbop-response-golr');

///
/// Helpers and aliases.
///

var each = us.each;

function _die(message){
    console.error('amigo-create-base-stats-cache.js: ' + message);
    process.exit(-1);
}

///
/// CLI handling, environment setup, and initialization of clients.
///

// CLI handling.
var argv = require('minimist')(process.argv.slice(2));
//console.dir(argv);

// What date range do we want?
var from_date = argv['f'] || argv['from-date'] || null;
var to_date = argv['t'] || argv['to-date'] || null;

// Allow the possibility of a different server.
var in_golr_server = argv['s'] || argv['server'] || null;
if( in_golr_server && us.isString(in_golr_server) ){
    gserv = in_golr_server;
}

///
/// Ranges and variables.
///

var our_evidence_of_interest = [
    'similarity evidence', // okay
    'experimental evidence', // okay
    'curator inference', // okay
    'author statement',
    'combinatorial evidence',
    'evidence used in automatic assertion',
    'genomic context evidence'
    //'biological system reconstruction',
    //'imported information'
];

var our_species_of_interest = [
    ['O. sativa', '4530'],
    ['Z. mays', '4577'],
    ['B. sylvaticum', '29664'],
    ['T. aestivum', '4565'],
    ['T. monococcum', '4568'],
    ['A. thaliana', '3702'],
    ['T. turgidum', '4571'],
    ['M. domestica', '3750'],
    ['P. patens', '3218'],
    ['E. grandis', '71139'],
    ['B. oleracea', '3712'],
    ['G. max', '3847'],
    ['P. trichocarpa', '3694'],
    ['S. tuberosum', '4113'],
    ['C. sinensis', '2711'],
    ['G. raimondii', '29730'],
    ['B. rapa', '3711'],
    ['S. italica', '4555'],
    ['P. persica', '3760'],
    ['A. tauschii', '37682'],
    ['P. abies', '3329'],
    ['T. urartu', '4572'],
    ['M. esculenta', '3983'],
    ['P. taeda', '3352'],
    ['M. acuminata', '4641'],
    ['C. clementina', '85681'],
    ['A. lyrata', '59689'],
    ['S. bicolor', '4558'],
    ['C. arietinum', '3827'],
    ['C. cajan', '3821'],
    ['B. distachyon', '15368']/*,
    ['E. guttata', '4155'],
    ['C. rubella', '81985'],
    ['C. annuum', '4072'],
    ['Z. mays subsp mays', '381124'],
    ['J. curcas', '180498'],
    ['C. canephora', '49390'],
    ['M. truncatula', '3880'],
    ['L. perrieri', '77586'],
    ['T. cacao', '3641'],
    ['V. vinifera', '29760'],
    ['F. vesca', '57918'],
    ['N. nucifera', '4432'],
    ['R. communis', '3988'],
    ['P. dactylifera', '42345'],
    ['H. vulgare', '4513'],
    ['C. lanatus', '3654'],
    ['C. sativus', '3659'],
    ['C. sativa', '3483'],
    ['S. moellendorffii', '88036'],
    ['S. lycopersicum', '4081']
*/
];

var our_assigners_of_interest = [
    // Done in first pass.
];

// The data that we'll be filling out and returning.
var glob = {
    // Metadata.
    species_of_interest: our_species_of_interest,
    evidence_of_interest: our_evidence_of_interest,
    assigners_of_interest: [], // Done in first pass.
    // Counts.
    publications: {
	//assigners_by_aspect : {},
	assigners_with_exp : {}
    },
    annotations: {
	species_with_exp : {},
	species_with_nonexp : {},
	species_by_evidence_by_aspect : {},
	assigners_with_exp : {},
	assigners_with_nonexp : {},
	//assigners_by_aspect_with_exp : {},
	evidence : {}
    }
};

///
/// Manager creators.
///

// We'll be using a lot of managers here, use creator macro.
function _new_manager_by_personality(personality){

    var engine = new node_engine(golr_response);
    var manager = new golr_manager(gserv, gconf, engine, 'async');

    manager.set_personality(personality);
    manager.add_query_filter('document_category', personality);

    if( from_date && to_date ){
	if( personality === 'annotation' ){
	    manager.set_extra('&fq=date:['+ from_date + ' TO ' + to_date +']');
	}
    }

    return manager;
}

function _new_totals_manager_by_personality(personality){

    var manager = _new_manager_by_personality(personality);

    manager.set('rows', 0);
    manager.set_facet_limit(0);

    return manager;
}

function _new_facets_manager_by_personality(personality){

    var manager = _new_manager_by_personality(personality);

    manager.set('rows', 0);
    manager.set_facet_limit(-1);

    return manager;
}

///
/// First pass--collect meta-data that we'll need to get access to
/// data later on.
///

function first_pass(){

    //First, collect all our assigners.
    var manager = _new_facets_manager_by_personality('annotation');
    manager.register('search', function(resp){

	// Extract the assigners facet.
	// console.log('resp', resp);
	// console.log(resp.facet_field_list());
	var src_facet = resp.facet_field('assigned_by') || [];
	//console.log('raw_data', raw_data);
	var srcs = us.map(src_facet, function(datum){
	    return datum[0];
	});

	our_assigners_of_interest = srcs;
	glob['assigners_of_interest'] = srcs;
	//console.log('glob', glob);

	console.log('Going to second pass...');
	second_pass();
    });

    manager.search();
}

///
/// Second pass, collect that data that we want to display.
///

function second_pass(){

    // Doesn't matter what personality, we're just using this as the
    // coordinator.
    var glob_manager = _new_manager_by_personality('annotation');
    var glob_funs = [];

    // Looking by assigners.
    each(our_assigners_of_interest, function(src){

	// Experimental.
	glob_funs.push(function(){

	    //  Minimal, only want count.
	    var manager = _new_totals_manager_by_personality('annotation');
	    manager.add_query_filter('assigned_by', src);
	    manager.add_query_filter('evidence_subset_closure_label',
				     'experimental evidence');

	    manager.register('search', function(resp){
		glob['annotations']['assigners_with_exp'][src] =
		    resp.total_documents();
		// console.log(glob);
	    });

	    return manager.search();
	});

	// Non-experimental.
	glob_funs.push(function(){

	    //  Minimal, only want count.
	    var manager = _new_totals_manager_by_personality('annotation');
	    manager.add_query_filter('assigned_by', src);
	    manager.add_query_filter('evidence_subset_closure_label',
				     'experimental evidence', ['-']);

	    manager.register('search', function(resp){
		glob['annotations']['assigners_with_nonexp'][src] =
		    resp.total_documents();
		// console.log(glob);
	    });

	    return manager.search();
	});

	// // Experimental ann by aspect.
	// each(['P', 'F', 'C'], function(aspect){

	//     glob_funs.push(function(){

	// 	//  Minimal, only want count.
	// 	var manager = _new_totals_manager_by_personality('annotation');
	// 	manager.add_query_filter('assigned_by', src);
	// 	manager.add_query_filter('evidence_subset_closure_label',
	// 				 'experimental evidence');
	// 	manager.add_query_filter('aspect', aspect);

	// 	manager.register('search', function(resp){

	// 	    // Ensure.
	// 	    var sea = glob['annotations']['assigners_by_aspect_with_exp'];
	// 	    if( typeof(sea[src]) === 'undefined' ){
	// 		sea[src] = {};
	// 	    }

	// 	    sea[src][aspect] = resp.total_documents();
	// 	    // console.log(glob);
	// 	});

	// 	return manager.search();
	//     });
	// });

	// Experimental publications.
	// publications.assigners_with_exp : {},
	glob_funs.push(function(){

	    //  Minimal, only want count.
	    var manager = _new_facets_manager_by_personality('annotation');
	    manager.add_query_filter('assigned_by', src);
	    manager.add_query_filter('evidence_subset_closure_label',
				     'experimental evidence');
	    manager.facets('reference');

	    manager.register('search', function(resp){

		// Extract the facet.
		var ref_facet = resp.facet_field('reference') || [];
		//console.log('raw_data', raw_data);
		var ref_count = 0;
		each(ref_facet, function(datum){
		    var count = datum[1];
		    ref_count += count;
		});

		glob['publications']['assigners_with_exp'][src] = ref_count;
		// console.log(glob);
	    });

	    return manager.search();
	});

	// // Publications by aspect.
	// // publications.assigners_by_aspect : {},
	// each(['P', 'F', 'C'], function(aspect){

	//     glob_funs.push(function(){

	// 	//  Minimal, only want count.
	// 	var manager = _new_facets_manager_by_personality('annotation');
	// 	manager.add_query_filter('assigned_by', src);
	// 	manager.add_query_filter('aspect', aspect);

	// 	manager.register('search', function(resp){

	// 	    // Extract the facet.
	// 	    var ref_facet = resp.facet_field('reference') || [];
	// 	    //console.log('raw_data', raw_data);
	// 	    var ref_count = 0;
	// 	    each(ref_facet, function(datum){
	// 		var count = datum[1];
	// 		ref_count += count;
	// 	    });

	// 	    glob['publications']['assigners_by_aspect'][src] = ref_count;
	// 	    // console.log(glob);
	// 	});

	// 	return manager.search();
	//     });
	// });

    });

    // Looking by species.
    each(our_species_of_interest, function(species){

	var lbl = species[0];
	var sid = species[1];

	// Experimental.
	glob_funs.push(function(){

	    //  Minimal, only want count.
	    var manager = _new_totals_manager_by_personality('annotation');
	    manager.add_query_filter('taxon_closure', 'NCBITaxon:' + sid);
	    manager.add_query_filter('evidence_subset_closure_label',
				     'experimental evidence');

	    manager.register('search', function(resp){
		glob['annotations']['species_with_exp'][sid] =
		    resp.total_documents();
		// console.log(glob);
	    });

	    return manager.search();
	});

	// Non-experimental.
	glob_funs.push(function(){

	    //  Minimal, only want count.
	    var manager = _new_totals_manager_by_personality('annotation');
	    manager.add_query_filter('taxon_closure', 'NCBITaxon:' + sid);
	    manager.add_query_filter('evidence_subset_closure_label',
				     'experimental evidence', ['-']);

	    manager.register('search', function(resp){
		glob['annotations']['species_with_nonexp'][sid] =
		    resp.total_documents();
		// console.log(glob);
	    });

	    return manager.search();
	});

	// Okay, a little deeper here. We're going to grab aspect as
	// well.
	// glob['annotation']['species_by_aspect_by_evidence'] : {},
	each(our_evidence_of_interest, function(ev){

	    each(['P', 'F', 'C', 'T', 'A', 'E', 'G'], function(aspect){
		glob_funs.push(function(){

		    //  Minimal, only want count.
		    var manager =
			    _new_totals_manager_by_personality('annotation');
		    manager.add_query_filter('taxon_closure', 'NCBITaxon:' + sid);
		    manager.add_query_filter('aspect', aspect);
		    manager.add_query_filter('evidence_subset_closure_label', ev);

		    manager.register('search', function(resp){

			// Ensure.
			var ga = glob['annotations'];
			var gas = ga['species_by_evidence_by_aspect'];
			if( typeof(gas[sid]) === 'undefined' ){
			    gas[sid] = {};
			}
			if( typeof(gas[sid][ev]) === 'undefined' ){
			    gas[sid][ev] = {};
			}

			// Finally, add.
			gas[sid][ev][aspect] = resp.total_documents();
		    });

		    return manager.search();
		});

	    });
	});

    });

    // Looking by evidence.
    each(our_evidence_of_interest, function(ev){

	// ...
	glob_funs.push(function(){

	    var manager = _new_totals_manager_by_personality('annotation');
	    //  Minimal, only want count.
	    manager.add_query_filter('evidence_subset_closure_label', ev);

	    manager.register('search', function(resp){
		glob['annotations']['evidence'][ev] =
		    resp.total_documents();
	    });

	    return manager.search();
	});

    });

    ///
    /// Runner.
    ///

    var fun_count = 0;
    var total_funs = glob_funs.length;
    glob_manager.run_promise_functions(glob_funs, function(resp, man){
	fun_count++;
	console.log(fun_count + ' of ' + total_funs);
    }, function(man){
	// Dump to file.
	console.log(JSON.stringify(glob, true, 3));
	fs.writeFileSync('./perl/bin/amigo-base-statistics-cache.json',
			 JSON.stringify(glob));
    }, function(err, man){
	// No error code.
    });

}

// And kick off with the first pass trigger.
first_pass();
