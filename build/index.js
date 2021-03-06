'use strict';

var _commander = require('commander');

var _commander2 = _interopRequireDefault(_commander);

var _colors = require('colors');

var _colors2 = _interopRequireDefault(_colors);

var _process = require('process');

var _process2 = _interopRequireDefault(_process);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _firebaseAdmin = require('firebase-admin');

var _firebaseAdmin2 = _interopRequireDefault(_firebaseAdmin);

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var accountCredentialsPathParamKey = 'accountCredentials';

var accountCredentialsPathParamDescription = 'Google Cloud account credentials JSON file';

var backupPathParamKey = 'backupPath';
var backupPathParamDescription = 'Path to store backup.';

var restoreAccountCredentialsPathParamKey = 'restoreAccountCredentials';
var restoreAccountCredentialsPathParamDescription = 'Google Cloud account credentials JSON file for restoring documents.';

var prettyPrintParamKey = 'prettyPrint';
var prettyPrintParamDescription = 'JSON backups done with pretty-printing.';

var packagePath = __dirname.includes('/build') ? '..' : '.';
var version = require(packagePath + '/package.json').version;

_commander2.default.version(version).option('-a, --' + accountCredentialsPathParamKey + ' <path>', accountCredentialsPathParamDescription).option('-B, --' + backupPathParamKey + ' <path>', backupPathParamDescription).option('-a2, --' + restoreAccountCredentialsPathParamKey + ' <path>', restoreAccountCredentialsPathParamDescription).option('-P, --' + prettyPrintParamKey, prettyPrintParamDescription).parse(_process2.default.argv);

var accountCredentialsPath = _commander2.default[accountCredentialsPathParamKey];
if (!accountCredentialsPath) {
  console.log(_colors2.default.bold(_colors2.default.red('Missing: ')) + _colors2.default.bold(accountCredentialsPathParamKey) + ' - ' + accountCredentialsPathParamDescription);
  _commander2.default.help();
  _process2.default.exit(1);
}

if (!_fs2.default.existsSync(accountCredentialsPath)) {
  console.log(_colors2.default.bold(_colors2.default.red('Account credentials file does not exist: ')) + _colors2.default.bold(accountCredentialsPath));
  _commander2.default.help();
  _process2.default.exit(1);
}

var backupPath = _commander2.default[backupPathParamKey];
if (!backupPath) {
  console.log(_colors2.default.bold(_colors2.default.red('Missing: ')) + _colors2.default.bold(backupPathParamKey) + ' - ' + backupPathParamDescription);
  _commander2.default.help();
  _process2.default.exit(1);
}

var restoreAccountCredentialsPath = _commander2.default[restoreAccountCredentialsPathParamKey];
if (restoreAccountCredentialsPath && !_fs2.default.existsSync(restoreAccountCredentialsPath)) {
  console.log(_colors2.default.bold(_colors2.default.red('Restore account credentials file does not exist: ')) + _colors2.default.bold(restoreAccountCredentialsPath));
  _commander2.default.help();
  _process2.default.exit(1);
}

var prettyPrint = _commander2.default[prettyPrintParamKey] !== undefined && _commander2.default[prettyPrintParamKey] !== null;

var getFireApp = function getFireApp(credentialsPath, appName) {
  try {
    var credentialsBuffer = _fs2.default.readFileSync(credentialsPath);

    var credentials = JSON.parse(credentialsBuffer.toString());
    return _firebaseAdmin2.default.initializeApp({
      credential: _firebaseAdmin2.default.credential.cert(credentials)
    }, appName || credentialsPath);
  } catch (error) {
    console.log(_colors2.default.bold(_colors2.default.red('Unable to read: ')) + _colors2.default.bold(credentialsPath) + ' - ' + error);
    return _process2.default.exit(1);
  }
};

var accountApp = getFireApp(accountCredentialsPath);

try {
  _mkdirp2.default.sync(backupPath);
} catch (error) {
  console.log(_colors2.default.bold(_colors2.default.red('Unable to create backup path: ')) + _colors2.default.bold(backupPath) + ' - ' + error);
  _process2.default.exit(1);
}

var restoreAccountApp = restoreAccountCredentialsPath ? getFireApp(restoreAccountCredentialsPath) : {};

// from: https://hackernoon.com/functional-javascript-resolving-promises-sequentially-7aac18c4431e
var promiseSerial = function promiseSerial(funcs) {
  return funcs.reduce(function (promise, func) {
    return promise.then(function (result) {
      return func().then(function () {
        return Array.prototype.concat.bind(result);
      });
    });
  }, Promise.resolve([]));
};

var backupDocument = function backupDocument(document, backupPath, logPath) {
  console.log("Backing up Document '" + logPath + document.id + "'");
  try {
    _mkdirp2.default.sync(backupPath);
    var fileContents = void 0;
    if (prettyPrint === true) {
      fileContents = JSON.stringify(document.data(), null, 2);
    } else {
      fileContents = JSON.stringify(document.data());
    }
    _fs2.default.writeFileSync(backupPath + '/' + document.id + '.json', fileContents);

    return document.ref.getCollections().then(function (collections) {
      return promiseSerial(collections.map(function (collection) {
        return function () {
          return backupCollection(collection, backupPath + '/' + collection.id, logPath + document.id + '/');
        };
      }));
    });
  } catch (error) {
    console.log(_colors2.default.bold(_colors2.default.red("Unable to create backup path or write file, skipping backup of Document '" + document.id + "': ")) + _colors2.default.bold(backupPath) + ' - ' + error);
    //   process.exit(1)
    return Promise.reject(error);
  }
};

var backupCollection = function backupCollection(collection, backupPath, logPath) {
  console.log("Backing up Collection '" + logPath + collection.id + "'");
  try {
    _mkdirp2.default.sync(backupPath);

    return collection.get().then(function (snapshots) {
      var backupFunctions = [];
      snapshots.forEach(function (document) {
        backupFunctions.push(function () {
          var backupDocumentPromise = backupDocument(document, backupPath + '/' + document.id, logPath + collection.id + '/');
          restoreDocument(logPath + collection.id, document);
          return backupDocumentPromise;
        });
      });
      return promiseSerial(backupFunctions);
    });
  } catch (error) {
    console.log(_colors2.default.bold(_colors2.default.red("Unable to create backup path, skipping backup of Collection '" + collection.id + "': ")) + _colors2.default.bold(backupPath) + ' - ' + error);
    return Promise.reject(error);
  }
};

var accountDb = accountApp.firestore();

var restoreAccountDb = restoreAccountCredentialsPath ? restoreAccountApp.firestore() : null;

var restoreDocument = function restoreDocument(collectionName, document) {
  var restoreMsg = 'Restoring to collection ' + collectionName + ' document ' + document.id;
  console.log(restoreMsg + '...');
  return Promise.resolve(!restoreAccountDb ? null : restoreAccountDb.collection(collectionName).doc(document.id).set(document.data())).catch(function (error) {
    console.log(_colors2.default.bold(_colors2.default.red('Error! ' + restoreMsg + ' - ' + error)));
  });
};

accountDb.getCollections().then(function (collections) {
  return promiseSerial(collections.map(function (collection) {
    return function () {
      return backupCollection(collection, backupPath + '/' + collection.id, '/');
    };
  }));
});