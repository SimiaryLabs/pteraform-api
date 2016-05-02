# Pteraform API
Pteraform is a platform designed to put geographic and temporal lenses on large document collections.  Pteraform works by ingesting documents, parsing out the geographic and temporal content, and storing the structured representation of this information in a MongoDB JSON document.  This structured data then becomes the basis for analysis.  Pteraform is an ongoing project, and we welcome contributions and feature requests from the community. 

The Pteraform API includes functions to programmatically create a corpus, and add documents, which are automatically temporally and geographically parsed.  Currently, the parsing is done using existing open source tools.  The geoparser is the CLIFF tool built by the MIT Center for Civic Media (https://github.com/c4fcm/CLIFF).  The temporal parser is the HeidelTime tagger (https://github.com/HeidelTime/heideltime).

Pterform has been supported by a Knight Foundation prototype fund grant.

### Requirements

The Pteraform API is built using Meteor.  To install Meteor follow the instructions [here](https://www.meteor.com/install).

### Running

To run the API start it using Meteor, specifying the settings file as follows: 

`meteor --settings settings-development.json` 

### Using the API

The Pteraform API creates structured JSON representations that are stored in MongoDB format.  The main collections in the database are **users**, **api-keys**, **corpora**, **documents**, **sections**, and **paragraphs**.

A hierarchical structure of a document collection is stored in these collections.  A corpus contains multiple documents, which consist of sections, which in turn are made up of paragraphs.  Every corpus, document, section, and paragraph has an owner which corresponds to a user in the users collection.  

#### Corpus data structure

```{
  "_id": "abc123",
  "owner": "jSYAssShXrfBQQ3Rm",
  "title": "A collection",
  "description": "Description of the collection",
  "creationDate": ISODate(...),
  "modifyDate": ISODate(...)
}
```

The Pteraform API can receive POST, GET, PUT, and DELETE requests.  Data is added to the collection using POST requests and JSON data body.  The api key is matched to the user account and used to set the owner of the data in the collection.

### Creating a corpus

POST request
```
http://0.0.0.0:3000/api/v1/corpus
{
  "api_key": "api key goes here",
  "title": "new corpus",
  "description": "this is a new corpus."
}
```

### Adding a document to a corpus from raw text

This command will separate the text into paragraphs based on new lines and create the appropriate structures in the **documents**, **sections**, and **paragraphs** collections.  It will also automatically geoparse and temporally parse the document and store the results.

POST request
```
http://0.0.0.0:3000/api/v1/document
{
  "api_key": "api key goes here",
  "title": "news article from times",
  "text": "... full document text goes here ...",
  "corpus": "DDBNuaaEyLcbhkZga",
  "properties": {
    "url": "http://source.url.goes.here",
    "type": "news"
  },
  "options": {
    "doGeo": true,
    "doTemporal": true
  }
}
```

### Future features

As we build out Pteraform we will be adding functionality to support the needs of the community.  Of high priority will be adding the ability to import custom gazetteers to geoparsing documents for specific domains, for example, historical place names and points-of-interest.

###### Configuration
The Pteraform API was built off of the [Meteor Chef API Base](https://github.com/themeteorchef/writing-an-api), which includes a pattern for managing your API keys, connection strings, and other configuration information using two files: `settings-development.json` and `settings-production.json`. This pattern separates your development and production configuration into two separate files for the sake of security.

Per [Josh Owens' article](http://joshowens.me/environment-settings-and-security-with-meteor-js/), it's considered "bad practice" to check your production keys into your repo (private or otherwise). Base accounts for this by giving you two separate files, but also specifies that your `settings-production.json` file should be ignored by git in `.gitignore`.

This means that keys that are only used for testing or development purposes can be placed in `settings-development.json`, while keys used in your production application should be placed in `settings-production.json`. Sharing and management of `settings-production.json` should be done on a person-to-person basis and _not_ made globally accessible.

The API has lightweight client-side code for creating accounts and assigning API keys to users.
