API = {
  authentication: function( apiKey ) {
    var getUser = APIKeys.findOne( { "key": apiKey }, { fields: { "owner": 1 } } );
    if ( getUser ) {
      return getUser.owner;
    } else {
      return false;
    }
  },
  connection: function( request ) {
    var getRequestContents = API.utility.getRequestContents( request ),
        apiKey             = getRequestContents.api_key,
        validUser          = API.authentication( apiKey );

    if ( validUser ) {
      // Now that we've validated our user, we make sure to scrap their API key
      // from the data we received. Next, we return a new object containing our
      // user's ID along with the rest of the data they sent.
      delete getRequestContents.api_key;
      return { owner: validUser, data: getRequestContents };
    } else {
      return { error: 401, message: "Invalid API key." };
    }
  },
  handleRequest: function( context, resource, method ) {
    var connection = API.connection( context.request );
    if ( !connection.error ) {
      API.methods[ resource ][ method ]( context, connection );
    } else {
      API.utility.response( context, 401, connection );
    }
  },
  methods: {
    document: {
      GET: function(context, connection) {
        var hasQuery = API.utility.hasData(connection.data);
        if (hasQuery) {
          connection.data.owner = connection.owner;
          var getDocuments;
          if (connection.data._id) {
            getDocuments = Documents.find(connection.data, {limit: 10}).fetch();
          } else { // if a specific document is not searched for, then only return the document ids that match the query
            getDocuments = Documents.find(connection.data, { fields: { "_id": 1 } } ).fetch();
          }
          if (getDocuments.length > 0) {
            API.utility.response(context, 200, getDocuments);
          } else {
            API.utility.response(context, 404, { error: 404, message: "No document found." } );
          }
        } else {
          var getDocuments = Documents.find( {"owner": connection.owner}, { fields: { "_id": 1 } } ).fetch();
          API.utility.response(context, 200, getDocuments);
        }
      },
      POST: function(context, connection) {
        var hasData = API.utility.hasData(connection.data),
            validData = API.utility.validate( connection.data, Match.OneOf(
              // from url
              { "corpus": String, "url": String },
              { "corpus": String, "url": String, "docboost": Number },
              { "corpus": String, "url": String, "options": Object },
              { "corpus": String, "url": String, "properties": Object },
              { "corpus": String, "url": String, "options": Object, "properties": Object },
              { "corpus": String, "url": String, "docboost": Number, "options": Object },
              { "corpus": String, "url": String, "docboost": Number, "properties": Object },
              { "corpus": String, "url": String, "docboost": Number, "properties": Object, "options": Object },

              // plain text block
              { "corpus": String, "title": String, "text": String },
              { "corpus": String, "title": String, "text": String, "docboost": Number },
              { "corpus": String, "title": String, "text": String, "options": Object },
              { "corpus": String, "title": String, "text": String, "docboost": Number, "options": Object },
              { "corpus": String, "title": String, "text": String, "properties": Object },
              { "corpus": String, "title": String, "text": String, "docboost": Number, "properties": Object },
              { "corpus": String, "title": String, "text": String, "properties": Object, "options": Object },
              { "corpus": String, "title": String, "text": String, "docboost": Number, "properties": Object, "options": Object },

              // array of paragraph objects (no sections defined)
              { "corpus": String, "title": String, "paragraphs": [ String ] },
              { "corpus": String, "title": String, "paragraphs": [ String ], "docboost": Number },
              { "corpus": String, "title": String, "paragraphs": [ String ], "options": Object },
              { "corpus": String, "title": String, "paragraphs": [ String ], "docboost": Number, "options": Object },
              { "corpus": String, "title": String, "paragraphs": [ String ], "properties": Object },
              { "corpus": String, "title": String, "paragraphs": [ String ], "docboost": Number, "properties": Object },
              { "corpus": String, "title": String, "paragraphs": [ String ], "properties": Object, "options": Object },
              { "corpus": String, "title": String, "paragraphs": [ String ], "docboost": Number, "properties": Object, "options": Object },

              // array of section objects (with paragraphs inside)
              { "corpus": String, "title": String, "sections": [ Object ] },
              { "corpus": String, "title": String, "sections": [ Object ], "docboost": Number },
              { "corpus": String, "title": String, "sections": [ Object ], "options": Object },
              { "corpus": String, "title": String, "sections": [ Object ], "docboost": Number, "options": Object },
              { "corpus": String, "title": String, "sections": [ Object ], "properties": Object },
              { "corpus": String, "title": String, "sections": [ Object ], "docboost": Number, "properties": Object },
              { "corpus": String, "title": String, "sections": [ Object ], "properties": Object, "options": Object },
              { "corpus": String, "title": String, "sections": [ Object ], "docboost": Number, "properties": Object, "options": Object },

            ));
        if (hasData && validData) {
          connection.data.owner = connection.owner;
          // check if corpus exists and the owner is the same
          var getCorpus = Corpora.findOne( { "_id": connection.data.corpus, "owner": connection.data.owner }, { fields: { "_id": 1 } } );

          if ( !getCorpus ) {
              API.utility.response(context, 403, {error: 403, message: "This corpus is not available for documents to be added."});
          } else {
            var prop = {};
            if (connection.data.properties) {
              prop = connection.data.properties;
            }
            var docboost = 1.0;
            if (connection.data.docboost) {
              docboost = connection.data.docboost;
            }
            var docId = Documents.insert({
              "owner": connection.data.owner,
              "corpus": connection.data.corpus,
              "title": connection.data.title,
              //"sourceURL": connection.data.sourceURL,
              "properties": prop,
              "creationDate": new Date(),
              "sections": [],
              "paragraphs": [],
              "docboost": docboost
            });

            //console.log("Insert docId: "+docId); 
 
            if (_.has(connection.data,'text') || _.has(connection.data,'paragraphs')) {
              // no section definitions, so just make a blank section object, since every paragraph must be in a section
              var sectionId = Sections.insert({
                "owner": connection.data.owner,
                "corpus": connection.data.corpus,
                "document": docId,
                "title": "",
                "type": "",
                "number": ""
              });

              // split the text by \r?\n characters
              // TODO: expand this to include other options
              var paragraphIds = [];
              var textParagraphs = "";
              if (_.has(connection.data,'text')) {
                textParagraphs = connection.data.text.split(/\r?\n/);
              } else if (_.has(connection.data,'paragraphs')) {
                textParagraphs = connection.data.paragraphs;
              }
              var beginChar = 0;
              var fullTextArray = [];
              var fullWordCount = 0;
              for (var i = 0; i < textParagraphs.length; i++) {
                var newParagraph = textParagraphs[i].trim();
                if (newParagraph.length > 0) { // ignore empty paragraphs
                  var wordCount = newParagraph.split(/\s+\b/).length;
                  fullWordCount = fullWordCount + wordCount;
                  var paragraphId = Paragraphs.insert({
                    "owner": connection.data.owner,
                    "text": newParagraph,
                    "corpus": connection.data.corpus,
                    "document": docId,
                    "section": sectionId,
                    "begin": beginChar,
                    "end": (beginChar + newParagraph.length),
                    "wordCount": wordCount
                  });
                  paragraphIds.push(paragraphId);
                  beginChar = beginChar + newParagraph.length + 1;
                  fullTextArray.push(newParagraph);
                }
              }
              var fullText = fullTextArray.join("\n");
  
              // update document with paragraph and section information
              Documents.update( { "_id": docId }, {$set: {
                "fullText": fullText,
                "paragraphs": paragraphIds,
                "sections": [ sectionId ],
                "wordCount": fullWordCount,
                "modifyDate": new Date()
              }});

              // document has been created, now do additional parsing if set in the options
              if (connection.data.options) {
                var options = connection.data.options;
                if (options.doTemporal) { // do the temporal parsing right now
                  var date = null;
                  if (prop.date) {
                    date = prop.date;
                  }
                  var type = prop.type;
                  var r = API.utility.heideltime_async(docId, connection.owner, date, type);
                  if (!r) {
                    console.log("error heideltime parsing docId: "+docId);
                  }
                }
                if (options.doGeo) { // do the geo parsing right now
                  var r = API.utility.cliff_async(docId, connection.owner, options.doGeoboost);
                  if (!r) {
                    console.log("error cliff parsing docId: "+docId);
                  }
                }
              }
              API.utility.response(context, 200, {"_id": docId, "message": "Document successfully created."});
            } else if (_.has(connection.data,'sections')) { // already fully split into sections with paragraphs
              for (var i = 0; i < connection.data.sections.length; i++) {
                var title = "";
                if (connection.data.sections[i].title) {
                  title = connection.data.sections[i].title;
                }
                var type = "";
                if (connection.data.sections[i].type) {
                  type = connection.data.sections[i].type;
                }
                var number = "";
                if (connection.data.sections[i].number) {
                  number = connection.data.sections[i].number;
                }
              }

              var sectionIds = [];
              for (var i = 0; i < connection.data.sectionTitles.length; i++) {
                var sectionId = Sections.insert({
                  "owner": connection.data.owner,
                  "corpus": connection.data.corpus,
                  "document": docId,
                  "title": connection.data.sectionTitles[i],
                  "type": connection.data.sectionTypes[i],
                  "number": connection.data.sectionNumbers[i]
                });
                sectionIds.push(sectionId);
              }
  
              var paragraphIds = [];
              var beginChar = 0;
              var fullTextArray = [];
              var fullWordCount = 0;
              for (var i = 0; i < connection.data.paragraphs.length; i++) {
                var newParagraph = connection.data.paragraphs[i].trim();
                var sectionIdx = connection.data.sectionTitles.indexOf(connection.data.paragraphSections[i]);
                if (sectionIdx == -1) {
                  sectionIdx = 0;
                }
                var sectionId = sectionIds[sectionIdx];
                var wordCount = newParagraph.split(/\s+\b/).length;
                fullWordCount = fullWordCount + wordCount;
                var paragraphId = Paragraphs.insert({
                  "owner": connection.data.owner,
                  "text": newParagraph,
                  "corpus": connection.data.corpus,
                  "document": docId,
                  "section": sectionId,
                  "begin": beginChar,
                  "end": (beginChar + newParagraph.length),
                  "wordCount": wordCount
                });
                paragraphIds.push(paragraphId);
                beginChar = beginChar + newParagraph.length + 1;
                fullTextArray.push(newParagraph);
              }
              var fullText = fullTextArray.join("\n");

              // update document with paragraph and section information
              Documents.update( { "_id": docId }, {$set: {
                "fullText": fullText,
                "paragraphs": paragraphIds,
                "sections": sectionIds,
                "wordCount": fullWordCount,
                "modifyDate": new Date()
              }});

              // document has been created, now do additional parsing if set in the options
              if (connection.data.options) {
                var options = connection.data.options;
                if (options.doTemporal) { // do the temporal parsing right now
                  var date = null;
                  if (prop.date) {
                    date = prop.date;
                  }
                  var type = prop.type;
                  var r = API.utility.heideltime_async(docId, connection.owner, date, type);
                  if (!r) {
                    console.log("error heideltime parsing docId: "+docId);
                  }
                }
                if (options.doGeo) { // do the geo parsing right now
                  var r = API.utility.cliff_async(docId, connection.owner, options.doGeoboost);
                  if (!r) {
                    console.log("error cliff parsing docId: "+docId);
                  }
                }
              }
              API.utility.response(context, 200, {"_id": document, "message": "Document successfully created!"});
            } else {
              API.utility.response(context, 403, {error: 403, message: "Document POST calls must have a corpus, title, sourceURL, and text in the request body in the correct formats."});
            }
          }          
        } else {
          API.utility.response(context, 403, {error: 403, message: "Document POST calls must have a corpus, title, sourceURL, and text in the request body in the correct formats."});
        }
      },
      PUT: function( context, connection ) {
        // PUT can only be used to update properties of the document (e.g., title, sourceURL, or recognized entities). To change text DELETE and POST new document
        var hasQuery  = API.utility.hasData( connection.data ),
            validData = API.utility.validate( connection.data, Match.OneOf(
              { "_id": String, "title": String },
              { "_id": String, "sourceURL": String },
              { "_id": String, "title": String, "sourceURL": String }
            ));

        if ( hasQuery && validData ) {
          // Save the ID of the document we want to update and then sanatize our data
          var docId = connection.data._id;
          delete connection.data._id;

          var getDocument = Documents.findOne( { "_id": docId, "owner": connection.owner }, { fields: { "_id": 1 } } );

          if ( getDocument ) {
            connection.data.modifyDate = new Date();
            Documents.update( { "_id": docId }, { $set: connection.data } );
            API.utility.response( context, 200, { "message": "Document successfully updated!" } );
          } else {
            API.utility.response( context, 404, { "message": "Can't update a non-existent document." } );
          }
        } else {
          API.utility.response( context, 403, { error: 403, message: "PUT calls must have a document ID and at least a title or sourceURL passed in the request body in the correct formats (String, String)." } );
        }
      },
      DELETE: function( context, connection ) {
        var hasQuery  = API.utility.hasData( connection.data ),
            validData = API.utility.validate( connection.data, { "_id": String } );

        if ( hasQuery && validData ) {
          var docId  = connection.data._id;
          var getDocument = Documents.findOne( { "_id": docId, "owner": connection.owner }, { fields: { "_id": 1 } } );

          if ( getDocument ) {
            Documents.remove( { "_id": docId } );
            Sections.remove( { "document": docId } );
            Paragraphs.remove( { "document": docId } );
            API.utility.response( context, 200, { "message": "Document removed!" } );
          } else {
            API.utility.response( context, 404, { "message": "Can't delete a non-existent document." } );
          }
        } else {
          API.utility.response( context, 403, { error: 403, message: "DELETE calls must have an _id (and only an _id) in the request body in the correct format (String)." } );
        }
      }
      
    },
    section: { // sections cannot be POSTed or DELETEd directly, only modified
      GET: function(context, connection) {
        var hasQuery = API.utility.hasData(connection.data);
        if (hasQuery) {
          connection.data.owner = connection.owner;
          var getSections;
          if (connection.data.document) {
            getSections = Sections.find(connection.data).fetch();
          } else { // if no document is specified then limit to 10 results
            getSections = Sections.find(connection.data, {limit: 10}).fetch();
          }
          if (getSections.length > 0) {
            API.utility.response(context, 200, getSections);
          } else {
            API.utility.response(context, 404, { error: 404, message: "No section found." } );
          }
        } else {
          var getSections = Sections.find( {"owner": connection.owner}, {limit: 10} ).fetch();
          API.utility.response(context, 200, getSections);
        }
      },
      POST: function(context, connection) {
          API.utility.response( context, 403, { error: 403, message: "POST calls are not implemented for sections." } );
      },
      PUT: function(context, connection) {
        var hasQuery  = API.utility.hasData( connection.data ),
            validData = API.utility.validate( connection.data, Match.OneOf(
              { "_id": String, "title": String },
              { "_id": String, "type": String },
              { "_id": String, "number": String },
              { "_id": String, "title": String, "type": String },
              { "_id": String, "type": String, "number": String },
              { "_id": String, "title": String, "number": String },
              { "_id": String, "title": String, "type": String, "number": String  }
            ));

        if ( hasQuery && validData ) {
          var sectionId = connection.data._id;
          delete connection.data._id;

          var getSection = Sections.findOne( { "_id": sectionId, "owner": connection.owner }, { fields: { "_id": 1 } } );

          if ( getSection ) {
            Sections.update( { "_id": sectionId }, { $set: connection.data } );
            API.utility.response( context, 200, { "message": "Section successfully updated!" } );
          } else {
            API.utility.response( context, 404, { "message": "Can't update a non-existent section." } );
          }
        } else {
          API.utility.response( context, 403, { error: 403, message: "PUT calls must have a section ID and at least a title, type, or number passed in the request body in the correct formats (String, String, String)." } );
        }
      },
      DELETE: function(context, connection) {
          API.utility.response( context, 403, { error: 403, message: "DELETE calls are not implemented for sections." } );
      }
    },
    paragraph: { // paragraphs cannot be PUT, POSTed or DELETEd directly, only modified
      GET: function(context, connection) {
        var hasQuery = API.utility.hasData(connection.data);
        if (hasQuery) {
          connection.data.owner = connection.owner;
          var getParagraphs;
          if (connection.data.document) {
            getParagraphs = Paragraphs.find(connection.data).fetch();
          } else { // if no document is specified then limit to 10 results
            getParagraphs = Paragraphs.find(connection.data, {limit: 10}).fetch();
          }
          if (getParagraphs.length > 0) {
            API.utility.response(context, 200, getParagraphs);
          } else {
            API.utility.response(context, 404, { error: 404, message: "No paragraph found." } );
          }
        } else {
          var getParagraphs = Paragraphs.find( {"owner": connection.owner}, {limit: 10} ).fetch();
          API.utility.response(context, 200, getParagraphs);
        }
      },
      POST: function(context, connection) {
          API.utility.response( context, 403, { error: 403, message: "POST calls are not implemented for paragraphs." } );
      },
      PUT: function(context, connection) {
          API.utility.response( context, 403, { error: 403, message: "PUT calls are not implemented for paragraphs." } );
      },
      DELETE: function(context, connection) {
          API.utility.response( context, 403, { error: 403, message: "DELETE calls are not implemented for paragraphs." } );
      }
    },
    corpus: {
      GET: function(context, connection) {
        var hasQuery = API.utility.hasData(connection.data);
        if (hasQuery) {
          connection.data.owner = connection.owner;
          var getCorpora = Corpora.find(connection.data, {limit: 10}).fetch();
          if (getCorpora.length > 0) {
            API.utility.response(context, 200, getCorpora);
          } else {
            API.utility.response(context, 404, { error: 404, message: "No corpora found." } );
          }
        } else {
          var getCorpora = Corpora.find( {"owner": connection.owner}, {limit: 10} ).fetch();
          API.utility.response(context, 200, getCorpora);
        }
      },
      POST: function(context, connection) {
        var hasData   = API.utility.hasData(connection.data),
            validData = API.utility.validate(connection.data, Match.OneOf(
              { "title": String },
              { "title": String, "description": String }
            ));
        if (hasData && validData && connection.data.title) { // check also that title is not an empty String
          if (!Corpora.findOne( { "owner": connection.owner, "title": connection.data.title })) {
            connection.data.owner = connection.owner;
            connection.data.creationDate = new Date();
            connection.data.modifyDate = new Date();
            var corpusId = Corpora.insert( connection.data );

            API.utility.response( context, 200, { "_id": corpusId, "message": "Corpus successfully created!" } );
          } else {
            API.utility.response(context, 403, { error: 403, message: "Corpus with title " + connection.data.title + " already exists." } );  
          }
        } else {
          API.utility.response(context, 403, { error: 403, message: "corpus POST call must have a title passed in the request body in the correct format." } );
        }
      },
      PUT: function(context, connection) {
        var hasQuery  = API.utility.hasData( connection.data ),
            validData = API.utility.validate( connection.data, Match.OneOf(
              { "_id": String, "title": String },
              { "_id": String, "description": String },
              { "_id": String, "title": String, "description": String }
            ));

        if ( hasQuery && validData ) {
          var corpusId = connection.data._id;
          delete connection.data._id;

          var getCorpus = Corpora.findOne( { "_id": corpusId, "owner": connection.owner }, { fields: { "_id": 1 } } );

          if ( getCorpus ) {
            connection.data.modifyDate = new Date();
            Corpora.update( { "_id": corpusId }, { $set: connection.data } );
            API.utility.response( context, 200, { "message": "Corpus successfully updated!" } );
          } else {
            API.utility.response( context, 404, { "message": "Can't update a non-existent corpus." } );
          }
        } else {
          API.utility.response( context, 403, { error: 403, message: "PUT calls must have a corpus ID and at least a title passed in the request body in the correct format (String)." } );
        }
      },
      DELETE: function(context, connection) {
        var hasQuery  = API.utility.hasData( connection.data ),
            validData = API.utility.validate( connection.data, { "_id": String } );

        if ( hasQuery && validData ) {
          var corpusId  = connection.data._id;
          var getCorpus = Corpora.findOne({ "_id": corpusId, "owner": connection.owner }, { fields: { "_id": 1 } });

          if ( getCorpus ) {
            var docIds = Documents.find({ "corpus": corpusId }, { fields: { "_id": 1 } }).fetch();
            var docIdArray = [];
            for (var i=0; i < docIds.length; i++) {
              docIdArray.push(docIds[i]._id);
            }
            Sections.remove( { "document": { $in: docIdArray } } );
            Paragraphs.remove( { "document": { $in: docIdArray } } );
            Documents.remove( { "corpus": corpusId });

            Corpora.remove( { "_id": corpusId } );
            API.utility.response( context, 200, { "message": "Corpus removed!" } );
          } else {
            API.utility.response( context, 404, { "message": "Can't delete a non-existent corpus." } );
          }
        } else {
          API.utility.response( context, 403, { error: 403, message: "DELETE calls must have an _id (and only an _id) in the request body in the correct format (String)." } );
        }
      }
    },
    heideltime: {
      GET: function(context, connection) {
        API.utility.response( context, 403, { error: 403, message: "GET calls are not implemented for heideltime." } );
      },
      POST: function(context, connection) {
        var hasQuery  = API.utility.hasData( connection.data ),
            validData = API.utility.validate( connection.data, Match.OneOf(
              { "_id": String },
              { "_id": String, "date": String },
              { "_id": String, "type": String },
              { "_id": String, "date": String, "type": String }
            ));
        if ( hasQuery && validData ) {
          if (API.utility.heideltime(connection.data._id, connection.owner, connection.data.date, connection.data.type)) {
            API.utility.response( context, 202, { "message": "Updating document with temporal parsing information." } );
          } else {
            API.utility.response(context, 403, { error: 403, message: "Document not found." } );
          }
        } else {
          API.utility.response(context, 403, { error: 403, message: "heideltime POST call must have a document id passed in the request body in the correct format." } );
        }
      },
      PUT: function(context, connection) {
        API.utility.response( context, 403, { error: 403, message: "PUT calls are not implemented for heideltime." } );
      },
      DELETE: function(context, connection) {
        API.utility.response( context, 403, { error: 403, message: "DELETE calls are not implemented for heideltime." } );
      }
    },
    cliff: {
      GET: function(context, connection) {
        API.utility.response( context, 403, { error: 403, message: "GET calls are not implemented for cliff." } );
      },
      POST: function(context, connection) {
        var hasQuery  = API.utility.hasData( connection.data ),
            validData = API.utility.validate( connection.data, Match.OneOf(
              { "_id": String }
            ));
        if ( hasQuery && validData ) {
          if (API.utility.cliff(connection.data._id, connection.owner)) {
            API.utility.response( context, 200, { "message": "Updated document with geographic parsing information." } );
          } else {
            API.utility.response(context, 403, {error: 403, message: "Document not found."});
          }
        } else {
          API.utility.response(context, 403, { error: 403, message: "cliff POST call must have a document id passed in the request body in the correct format." } );
        }
      },
      PUT: function(context, connection) {
        API.utility.response( context, 403, { error: 403, message: "PUT calls are not implemented for cliff." } );
      },
      DELETE: function(context, connection) {
        API.utility.response( context, 403, { error: 403, message: "DELETE calls are not implemented for cliff." } );
      }
    }
  },
  utility: {
    getRequestContents: function( request ) {
      switch( request.method ) {
        case "GET":
          return request.query;
        case "POST":
        case "PUT":
        case "DELETE":
          return request.body;
      }
    },
    hasData: function( data ) {
      return Object.keys( data ).length > 0 ? true : false;
    },
    response: function( context, statusCode, data ) {
      context.response.setHeader( 'Content-Type', 'application/json' );
      context.response.statusCode = statusCode;
      context.response.end( JSON.stringify( data ) );
    },
    boilerpipe_extract: function ( url ) {
      let extractURL = "http://"+Meteor.settings.private.cliffDockerIP+":"+Meteor.settings.private.cliffDockerPort+"/cliff-2.3.0/extract";
      try {
        let result = HTTP.call( 'POST', extractURL,
          {
            url: url
          }
        );
        return result;
      } catch (err) {
        return err;
      }
    },
    cliff_async: function ( docId, owner, doGeoboost ) {
      var cliffServletURL = "http://"+Meteor.settings.private.cliffDockerIP+":"+Meteor.settings.private.cliffDockerPort+"/cliff-2.3.0/parse/text";

      // get the paragraphs for the document _id
      var doc = Documents.findOne( { "_id": docId, "owner": owner }, { fields: { "fullText": 1 } } );
      if (doc) {
        HTTP.call( 'POST', cliffServletURL, 
          {
            params: { 
              "q": doc.fullText,
              "replaceAllDemonyms": false 
            }
          },
          function (error, result) {
            if (!error && result.data.results) {
              console.log("cliff: "+result.statusCode+" , docId: "+docId);
              Documents.update( {"_id": docId}, { $set: { 
                "parsingResults.cliff": result.data,
                "geoParsed": true,
                "modifyDate": new Date() 
              }} );
              var placeMentions = [];
              for (var i = 0; i < result.data.results.places.mentions.length; i++) {
                var mention = result.data.results.places.mentions[i];
                placeMentions.push( {
                  "geonameid": mention.id,
                  "begin": mention.source.charIndex,
                  "end": (mention.source.charIndex + mention.source.string.length)
                } );
              }

              var paragraphs = Paragraphs.find( { document: docId }, { fields: { "_id": 1, "begin": 1, "end": 1 } } ).fetch();
              // now split up into relevant paragraphs
              for (var i = 0; i < paragraphs.length; i++) {
                var paragraph_places = [];              
                for (var j = 0; j < placeMentions.length; j++) {
                  if (placeMentions[j].begin >= paragraphs[i].begin && placeMentions[j].begin < paragraphs[i].end)
                    paragraph_places.push(placeMentions[j]);
                }
                var geographicEntities = {
                  places: paragraph_places
                };

                Paragraphs.update( {"_id": paragraphs[i]._id}, { $set: {
                  "geoEntities": geographicEntities
                }} );
              }

              // wait 3 sec to make sure everything is updated
              Meteor.setTimeout( () => {
                // calculate country and date statistics for the document
                API.utility.updateDocCountryStats(docId);

              }, 3000);

              // return true;
            } else if (error) {
              console.log(error);
            }
          }
        );
        return true;
      } else {
        return false;
      }
    },
    updateDocCountryStats: function(docId) {
      let paragraphs = Paragraphs.find( { "document": docId }, {fields: { "geoEntities": 1 } }).fetch();
      //console.log(paragraphs);
      let countryStats = {};
      let gaz = {};
      for (let i = 0; i < paragraphs.length; i++) {
        if (paragraphs[i].geoEntities && paragraphs[i].geoEntities.places) {
          let places = paragraphs[i].geoEntities.places;
          for (let p = 0; p < places.length; p++) {
            let place = places[p];
            if (place.geonameid) {
              if (!_.has(gaz, place.geonameid)) {
                let entry = Gazetteer.findOne( { 'geonameid': place.geonameid } );
                gaz[place.geonameid] = entry;
              }
              if (gaz[place.geonameid]) {
                let country = gaz[place.geonameid].country;
                if (country) {
                  //console.log(country);
                  if (!_.has(countryStats, country)) {
                    countryStats[country] = 1;
                  } else {
                    countryStats[country] = countryStats[country] + 1;
                  }
                }
              }
            }
          }
        }
      }
      Documents.update( {"_id": docId}, { $set: { "countryStats": countryStats } });
    },
    heideltimeCenturyOfYear: function (year) {
      const BC = "BC";
      if (year.startsWith(BC)) {
        let num = Math.floor(parseInt(year.slice(BC.length), 10) / 100);
        if (num < 10)
          return "BC0"+num.toString();
        else
          return "BC"+num.toString();
      } else {
        let num = Math.floor(parseInt(year, 10) / 100);
        if (num < 10)
          return "0" + num.toString();
        else
          return num.toString();
      }
    },
    heideltimeDecadeOfYear: function (year) {
      const BC = "BC";
      if (year.startsWith(BC)) {
        let num = Math.floor(parseInt(year.slice(BC.length), 10) / 10);
        if (num < 10)
          return "BC00" + num.toString();
        else if (num < 100)
          return "BC0" + num.toString();
        else
          return "BC" + num.toString();
      } else {
        let num = Math.floor(parseInt(year, 10) / 10);
        if (num < 10)
          return "00" + num.toString();
        else if (num < 100)
          return "0" + num.toString();
        else
          return num.toString();
      }
    },
    heideltimeCenturyOfDecade: function (decade) {
      const BC = "BC";
      if (decade.startsWith(BC)) {
        let num = Math.floor(parseInt(decade.slice(BC.length), 10) / 10);
        if (num < 10)
          return "BC0"+num.toString();
        else
          return "BC"+num.toString();
      } else {
        let num = Math.floor(parseInt(decade, 10) / 10);
        if (num < 10)
          return "0" + num.toString();
        else
          return num.toString();
      }
    },
    updateDocDateStats: function (docId) {
      let paragraphs = Paragraphs.find( { "document": docId }, { fields: { "temporalEntities": 1 } } ).fetch();
      let yearStats = {};
      let decadeStats = {};
      let centuryStats = {};
      const BC = "BC";
      for (let i = 0; i < paragraphs.length; i++) {
        if (paragraphs[i].temporalEntities) {
          let dateYears = paragraphs[i].temporalEntities.dateYear;
          for (let d = 0; d < dateYears.length; d++) {
            let year = dateYears[d].value;
            let century = API.utility.heideltimeCenturyOfYear(year);
            let decade = API.utility.heideltimeDecadeOfYear(year);
            //console.log(year + ":" + decade + ":" + century);
            if (!_.has(yearStats, year)) {
              yearStats[year] = 1;
            } else {
              yearStats[year] = yearStats[year] + 1;
            }
            if (!_.has(decadeStats, decade)) {
              decadeStats[decade] = 1;
            } else {
              decadeStats[decade] = decadeStats[decade] + 1;
            }
            if (!_.has(centuryStats, century)) {
              centuryStats[century] = 1;
            } else {
              centuryStats[century] = centuryStats[century] + 1;
            }
          }
          let dateYearMonths = paragraphs[i].temporalEntities.dateYearMonth;
          for (let d = 0; d < dateYearMonths.length; d++) {
            let year = dateYearMonths[d].value.split("-")[0];
            let century = API.utility.heideltimeCenturyOfYear(year);
            let decade = API.utility.heideltimeDecadeOfYear(year);
            //console.log(year + ":" + decade + ":" + century);
            if (!_.has(yearStats, year)) {
              yearStats[year] = 1;
            } else {
              yearStats[year] = yearStats[year] + 1;
            }
            if (!_.has(decadeStats, decade)) {
              decadeStats[decade] = 1;
            } else {
              decadeStats[decade] = decadeStats[decade] + 1;
            }
            if (!_.has(centuryStats, century)) {
              centuryStats[century] = 1;
            } else {
              centuryStats[century] = centuryStats[century] + 1;
            }
          }
          let dateYearMonthDays = paragraphs[i].temporalEntities.dateYearMonthDay;
          for (let d = 0; d < dateYearMonthDays.length; d++) {
            let year = dateYearMonthDays[d].value.split("-")[0];
            let century = API.utility.heideltimeCenturyOfYear(year);
            let decade = API.utility.heideltimeDecadeOfYear(year);
            //console.log(year + ":" + decade + ":" + century);
            if (!_.has(yearStats, year)) {
              yearStats[year] = 1;
            } else {
              yearStats[year] = yearStats[year] + 1;
            }
            if (!_.has(decadeStats, decade)) {
              decadeStats[decade] = 1;
            } else {
              decadeStats[decade] = decadeStats[decade] + 1;
            }
            if (!_.has(centuryStats, century)) {
              centuryStats[century] = 1;
            } else {
              centuryStats[century] = centuryStats[century] + 1;
            }
          }
          let dateCenturies = paragraphs[i].temporalEntities.dateCentury;
          for (let d = 0; d < dateCenturies.length; d++) {
            let century = dateCenturies[d].value;
            //console.log(century);
            if (!_.has(centuryStats, century)) {
              centuryStats[century] = 1;
            } else {
              centuryStats[century] = centuryStats[century] + 1;
            }
          }
          let dateDecades = paragraphs[i].temporalEntities.dateDecade;
          for (let d = 0; d < dateDecades.length; d++) {
            let decade = dateDecades[d].value;
            let century = API.utility.heideltimeCenturyOfDecade(decade);
            //console.log(decade + ":" + century);
            if (!_.has(decadeStats, decade)) {
              decadeStats[decade] = 1;
            } else {
              decadeStats[decade] = decadeStats[decade] + 1;
            }
            if (!_.has(centuryStats, century)) {
              centuryStats[century] = 1;
            } else {
              centuryStats[century] = centuryStats[century] + 1;
            }
          }
        }
      }
      Documents.update( {"_id": docId}, { $set: { "yearStats": yearStats, "decadeStats": decadeStats, "centuryStats": centuryStats } });
    },
    heideltime_async: function( docId, owner, date, type ) {
      var heideltimeServletBaseURL = "http://"+Meteor.settings.private.heideltimeDockerIP+":"+Meteor.settings.private.heideltimeDockerPort+"/TemporalTagger/";
      if (!date) { 
         // if no article date set then use current time
         var datenow = new Date();
         var year = datenow.getUTCFullYear();
         var month = datenow.getUTCMonth()+1;
         var day = datenow.getUTCDate();
         date = year + "-" + month + "-" + day;
      }
      if (!type) {
        type = "narrative";
      }

      // get the paragraphs for the document _id
      var doc = Documents.findOne( { "_id": docId, "owner": owner }, { fields: { "fullText": 1 } } );
      if (doc) {

        // default parser is narratives
        var urlEnd = "TaggerEnglishNarratives";
        if (type == "news") {
          urlEnd = "TaggerEnglishNews";
        } else if (type == "scientific") {
          urlEnd = "TaggerEnglishScientific";
        } else if (type == "colloquial") {
          urlEnd = "TaggerEnglishColloquial";
        }

        var url = heideltimeServletBaseURL + urlEnd;

        HTTP.call( 'POST', url, {
            params: { "q": doc.fullText, "date": date }
          },
          function (error, result) {
            if (!error && result.data) {
              console.log("heideltime: "+result.statusCode+" , docId: "+docId);

              if (result.data["xmi:XMI"]) {
                delete result.data["xmi:XMI"]["cas:Sofa"]; // this is extra copy of fullText, not needed
              }
              Documents.update( {"_id": docId}, { $set: { 
                "parsingResults.heideltime": result.data,
                "temporalParsed": true,
                "modifyDate": new Date() 
              }} );

              // unpack the timex information and organize into arrays in the paragraphs
              var timexDATEs_year = [];
              var timexDATEs_year_month = [];
              var timexDATEs_year_month_day = [];
              var timexDATEs_century = [];
              var timexDATEs_decade = [];
              var timexDATEs_other = [];

              var timexSETs = [];
              var timexTIMEs = [];
              var timexDURATIONs = [];

              if (result.data["xmi:XMI"]["heideltime:Timex3"]) {

                for (var i = 0; i < result.data["xmi:XMI"]["heideltime:Timex3"].length; i++) {
                  var value = String(result.data["xmi:XMI"]["heideltime:Timex3"][i].timexValue);
                  if (result.data["xmi:XMI"]["heideltime:Timex3"][i].timexType === "DATE") {

                    if (/^[0-9][0-9][0-9][0-9]$/.test(value) || /^BC[0-9][0-9][0-9][0-9]$/.test(value)) { // year only
                      timexDATEs_year.push( {
                        "value":   value,
                        "begin":   result.data["xmi:XMI"]["heideltime:Timex3"][i].begin,
                        "end":     result.data["xmi:XMI"]["heideltime:Timex3"][i].end,
                        "timexId": result.data["xmi:XMI"]["heideltime:Timex3"][i].timexId
                      } );
                    } else if (/^[0-9][0-9][0-9][0-9]-[0-9][0-9]$/.test(value) ||
                               /^BC[0-9][0-9][0-9][0-9]-[0-9][0-9]$/.test(value)) {
                      timexDATEs_year_month.push( {
                        "value":   value,
                        "begin":   result.data["xmi:XMI"]["heideltime:Timex3"][i].begin,
                        "end":     result.data["xmi:XMI"]["heideltime:Timex3"][i].end,
                        "timexId": result.data["xmi:XMI"]["heideltime:Timex3"][i].timexId
                      } );
                    } else if (/^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/.test(value) ||
                               /^BC[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]$/.test(value)) {
                      timexDATEs_year_month_day.push( {
                        "value":   value,
                        "begin":   result.data["xmi:XMI"]["heideltime:Timex3"][i].begin,
                        "end":     result.data["xmi:XMI"]["heideltime:Timex3"][i].end,
                        "timexId": result.data["xmi:XMI"]["heideltime:Timex3"][i].timexId
                      } );
                    } else if (/^[0-9][0-9][0-9]$/.test(value) || /^BC[0-9][0-9][0-9]$/.test(value)) { // decade
                      timexDATEs_decade.push( {
                        "value":   value,
                        "begin":   result.data["xmi:XMI"]["heideltime:Timex3"][i].begin,
                        "end":     result.data["xmi:XMI"]["heideltime:Timex3"][i].end,
                        "timexId": result.data["xmi:XMI"]["heideltime:Timex3"][i].timexId
                      } );
                    } else if (/^[0-9][0-9]$/.test(value) || /^BC[0-9][0-9]$/.test(value)) { // century
                      timexDATEs_century.push( {
                        "value":   value,
                        "begin":   result.data["xmi:XMI"]["heideltime:Timex3"][i].begin,
                        "end":     result.data["xmi:XMI"]["heideltime:Timex3"][i].end,
                        "timexId": result.data["xmi:XMI"]["heideltime:Timex3"][i].timexId
                      } );
                    } else {
                      timexDATEs_other.push( {
                        "value":   value,
                        "begin":   result.data["xmi:XMI"]["heideltime:Timex3"][i].begin,
                        "end":     result.data["xmi:XMI"]["heideltime:Timex3"][i].end,
                        "timexId": result.data["xmi:XMI"]["heideltime:Timex3"][i].timexId
                      } );
                    }
                  } else if (result.data["xmi:XMI"]["heideltime:Timex3"][i].timexType === "SET") {
                    timexSETs.push( {
                      "value":   value,
                      "begin":   result.data["xmi:XMI"]["heideltime:Timex3"][i].begin,
                      "end":     result.data["xmi:XMI"]["heideltime:Timex3"][i].end,
                      "timexId": result.data["xmi:XMI"]["heideltime:Timex3"][i].timexId
                    } );
                  } else if (result.data["xmi:XMI"]["heideltime:Timex3"][i].timexType === "TIME") {
                    timexTIMEs.push( {
                      "value":   value,
                      "begin":   result.data["xmi:XMI"]["heideltime:Timex3"][i].begin,
                      "end":     result.data["xmi:XMI"]["heideltime:Timex3"][i].end,
                      "timexId": result.data["xmi:XMI"]["heideltime:Timex3"][i].timexId
                    } );
                  } else if (result.data["xmi:XMI"]["heideltime:Timex3"][i].timexType === "DURATION") {
                    timexDURATIONs.push( {
                      "value":   value,
                      "begin":   result.data["xmi:XMI"]["heideltime:Timex3"][i].begin,
                      "end":     result.data["xmi:XMI"]["heideltime:Timex3"][i].end,
                      "timexId": result.data["xmi:XMI"]["heideltime:Timex3"][i].timexId
                    } );
                  }
                }
              }

              var paragraphs = Paragraphs.find( { document: docId }, { fields: { "_id": 1, "begin": 1, "end": 1 } } ).fetch();
              // now split up into relevant paragraphs
              for (var i = 0; i < paragraphs.length; i++) {
                var paragraph_timexDATEs_year = [];              
                for (var j = 0; j < timexDATEs_year.length; j++) {
                  if (timexDATEs_year[j].begin >= paragraphs[i].begin && timexDATEs_year[j].begin < paragraphs[i].end)
                    paragraph_timexDATEs_year.push(timexDATEs_year[j]);
                }

                var paragraph_timexDATEs_year_month = [];
                for (var j = 0; j < timexDATEs_year_month.length; j++) {
                  if (timexDATEs_year_month[j].begin >= paragraphs[i].begin && timexDATEs_year_month[j].begin < paragraphs[i].end)
                    paragraph_timexDATEs_year_month.push(timexDATEs_year_month[j]);
                }

                var paragraph_timexDATEs_year_month_day = [];
                for (var j = 0; j < timexDATEs_year_month_day.length; j++) {
                  if (timexDATEs_year_month_day[j].begin >= paragraphs[i].begin && timexDATEs_year_month_day[j].begin < paragraphs[i].end)
                    paragraph_timexDATEs_year_month_day.push(timexDATEs_year_month_day[j]);
                }

                var paragraph_timexDATEs_century = [];
                for (var j = 0; j < timexDATEs_century.length; j++) {
                  if (timexDATEs_century[j].begin >= paragraphs[i].begin && timexDATEs_century[j].begin < paragraphs[i].end)
                    paragraph_timexDATEs_century.push(timexDATEs_century[j]);
                }

                var paragraph_timexDATEs_decade = [];
                for (var j = 0; j < timexDATEs_decade.length; j++) {
                  if (timexDATEs_decade[j].begin >= paragraphs[i].begin && timexDATEs_decade[j].begin < paragraphs[i].end)
                    paragraph_timexDATEs_decade.push(timexDATEs_decade[j]);
                }

                var paragraph_timexDATEs_other = [];
                for (var j = 0; j < timexDATEs_other.length; j++) {
                  if (timexDATEs_other[j].begin >= paragraphs[i].begin && timexDATEs_other[j].begin < paragraphs[i].end)
                    paragraph_timexDATEs_other.push(timexDATEs_other[j]);
                }

                var paragraph_timexSETs = [];
                for (var j = 0; j < timexSETs.length; j++) {
                  if (timexSETs[j].begin >= paragraphs[i].begin && timexSETs[j].begin < paragraphs[i].end)
                    paragraph_timexSETs.push(timexSETs[j]);
                }

                var paragraph_timexTIMEs = [];
                for (var j = 0; j < timexTIMEs.length; j++) {
                  if (timexTIMEs[j].begin >= paragraphs[i].begin && timexTIMEs[j].begin < paragraphs[i].end)
                    paragraph_timexTIMEs.push(timexTIMEs[j]);
                }

                var paragraph_timexDURATIONs = [];
                for (var j = 0; j < timexDURATIONs.length; j++) {
                  if (timexDURATIONs[j].begin >= paragraphs[i].begin && timexDURATIONs[j].begin < paragraphs[i].end)
                    paragraph_timexDURATIONs.push(timexDURATIONs[j]);
                }
              
                var temporalEntities = {
                  "dateYear": paragraph_timexDATEs_year,
                  "dateYearMonth": paragraph_timexDATEs_year_month,
                  "dateYearMonthDay": paragraph_timexDATEs_year_month_day,
                  "dateCentury": paragraph_timexDATEs_century,
                  "dateDecade": paragraph_timexDATEs_decade,
                  "dateOther": paragraph_timexDATEs_other,
                  "time": paragraph_timexTIMEs,
                  "set": paragraph_timexSETs,
                  "duration": paragraph_timexDURATIONs
                };
                Paragraphs.update( {"_id": paragraphs[i]._id}, { $set: {
                  "temporalEntities": temporalEntities
                }} );
              }

              // now update the statistics for year, decade, and century for the whole document
              API.utility.updateDocDateStats(docId);
            } else if (error) { // error in result
              console.log(error);
            }
          }
        );
        return true;
      } else {
        return false;
      }
    },
    validate: function( data, pattern ) {
      return Match.test( data, pattern );
    }
  }
};
