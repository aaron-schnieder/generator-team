// This is the code that deals with TFS
const async = require('async');
const request = require('request');
const util = require('../app/utility');

const PROJECT_API_VERSION = '1.0';

function run(gen, callback) {
   "use strict";
   
   findOrCreateProject(gen, function (e, tp) {
      if (e) {
         // To get the stacktrace run with the --debug built-in option when 
         // running the generator.
         gen.env.error(e.message);
      }

      callback(e);
   });
}

function findOrCreateProject(gen, callback) {
   "use strict";

   var token = util.encodePat(gen.pat);

   util.tryFindProject(gen.tfs, gen.applicationName, token, gen, function (error, obj) {
      if (error) {
         callback(error, null);
      } else {
         // The project was found.
         if (obj) {
            gen.log(`+ Found Team project`);
            callback(error, obj);
            return;
         }

         gen.log(`+ Creating ${gen.applicationName} Team Project`);

         var teamProject = {};

         // Create the project
         // Use series to issue the REST API to create the project,
         // wait for it to be created or fail, and get the final id.
         async.series([
            function (thisSeries) {
               createProject(gen.tfs, gen.applicationName, token, gen, function (err, project) {
                  teamProject = project;
                  thisSeries(err);
               });
            },
            function (thisSeries) {
               var status = '';

               // Wait for Team Services to report that the project was created.
               // Use whilst to keep calling the the REST API until the status is
               // either failed or succeeded.
               async.whilst(
                  function () { return status !== 'failed' && status !== 'succeeded'; },
                  function (finished) {
                     util.checkStatus(teamProject.url, token, gen, function (err, stat) {
                        status = stat.status;
                        finished(err);
                     });
                  },
                  thisSeries
               );
            },
            function (thisSeries) {
               var options = {
                  method: 'GET',
                  headers: { 'cache-control': 'no-cache', 'authorization': `Basic ${token}` },
                  url: `${util.getFullURL(gen.tfs)}/_apis/projects/${gen.applicationName}`,
                  qs: { 'api-version': PROJECT_API_VERSION }
               };

               // Get the real id of the team project now that is exist.
               request(options, function (err, res, body) {
                  if (err) {
                     thisSeries(err);
                     return;
                  }

                  if (res.statusCode !== 200) {
                     gen.log.error('Unable to find newly created project.');
                     thisSeries({ message: 'Unable to find newly created project.' });
                     return;
                  }

                  var project = JSON.parse(body);
                  thisSeries(err, project);
               });
            }
         ], function (err, result) {
            // By the time I get there the series would have completed and
            // the first two entries in result would be null.  I only want
            // to return the team project and not the array because when we
            // find the team project if it already exist we only return the
            // team project.
            callback(err, result[2]);
         });
      }
   });
}

function createProject(account, project, token, gen, callback) {
   "use strict";

   var options = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Basic ${token}` },
      json: true,
      url: `${util.getFullURL(account)}/_apis/projects`,
      qs: { 'api-version': PROJECT_API_VERSION },
      body: {
         name: project,
         capabilities: {
            versioncontrol: { sourceControlType: 'Git' },
            processTemplate: {
               templateTypeId: '6b724908-ef14-45cf-84f8-768b5384da45'
            }
         }
      }
   };

   request(options, function (err, res, body) {
      callback(err, body);
   });
}

module.exports = {
   // Exports the portions of the file we want to share with files that require 
   // it.

   run: run,
   findOrCreateProject: findOrCreateProject,
};