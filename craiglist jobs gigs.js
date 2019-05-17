/** @OnlyCurrentDoc */

function fetchPostsAllTime() {
  // name of this function
  var callee = arguments.callee.toString().trim();
  var currentFunctionName = callee.substring(callee.indexOf('function') + 'function'.length, callee.indexOf('(')).trim();
  var currentFunctionNameRegExp = new RegExp(currentFunctionName, "i");
  
  // trigger already added?
  var triggerAdded = false;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var trigger = triggers[i];
    var triggerHandlerFunction = trigger.getHandlerFunction();
    if (triggerHandlerFunction && currentFunctionNameRegExp.test(triggerHandlerFunction) &&
      trigger.getEventType() == ScriptApp.EventType.CLOCK) {
        triggerAdded = true;
        break;
      }
  }

  // add trigger, if needed
  if (!triggerAdded) {
    var scriptProperties = PropertiesService.getScriptProperties();
    
    // posts in last 24 hours
    const POSTS_TWENTY_FOUR_HOURS = "posts_twenty_four_hours";
  
    scriptProperties.deleteProperty(POSTS_TWENTY_FOUR_HOURS);
    // run every ten minutes
    ScriptApp.newTrigger(currentFunctionName).timeBased().everyMinutes(10).create();
  } else {
    fetchPosts();
    resetScript(currentFunctionNameRegExp);
  }
}


function fetchPostsTwentyFourHours() {
  // name of this function
  var callee = arguments.callee.toString().trim();
  var currentFunctionName = callee.substring(callee.indexOf('function') + 'function'.length, callee.indexOf('(')).trim();
  var currentFunctionNameRegExp = new RegExp(currentFunctionName, "i");
  
  // trigger already added?
  var triggerAdded = false;
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var trigger = triggers[i];
    var triggerHandlerFunction = trigger.getHandlerFunction();
    if (triggerHandlerFunction && currentFunctionNameRegExp.test(triggerHandlerFunction) &&
      trigger.getEventType() == ScriptApp.EventType.CLOCK) {
        triggerAdded = true;
        break;
      }
  }
  
  // add trigger, if needed
  if (!triggerAdded) {
    var scriptProperties = PropertiesService.getScriptProperties();
    
    // posts in last 24 hours
    const POSTS_TWENTY_FOUR_HOURS = "posts_twenty_four_hours";

    scriptProperties.setProperty(POSTS_TWENTY_FOUR_HOURS, true);
    // run every ten minutes
    ScriptApp.newTrigger(currentFunctionName).timeBased().everyMinutes(10).create();
  } else {
    fetchPosts();
    resetScript(currentFunctionNameRegExp);
  }
}

function fetchPosts() {
  const LOG_SHEET = "Log";
  var logSheet = SpreadsheetApp.getActive().getSheetByName(LOG_SHEET) || insertSheet(LOG_SHEET, ["Date & Time", "Message"]);

  var spreadsheet = SpreadsheetApp.getActive();
  
  // input sheet
  var inputSheet = spreadsheet.getSheets().filter(function(sheet) {
    return new RegExp("(^|\W)input($|\W)", "i").test(sheet.getName());
  })[0];
  var inputSheetRange = inputSheet.getDataRange();
  // identify columns based on header and relative positions of column
  var inputSheetHeaders = inputSheetRange.offset(0, 0, 1).getDisplayValues()[0];
  var citySelectColumn, cityColumn;
  var jobSelectColumn, jobColumn, jobPathColumn, jobKeywordsColumn;
  var gigSelectColumn, gigColumn, gigPathColumn, gigKeywordsColumn;
  for (var i in inputSheetHeaders) {
    var header = inputSheetHeaders[i];
    if (header.search(/cities/i) >= 0) {
      cityColumn = Number(i) + 1;
      citySelectColumn = cityColumn - 1;
    } else if (header.search(/jobs/i) >= 0) {
      jobColumn = Number(i) + 1;
      jobSelectColumn = jobColumn - 1;
      jobPathColumn = jobColumn + 1;
      jobKeywordsColumn = jobPathColumn + 1;
    } else if (header.search(/gigs/i) >= 0) {
      gigColumn = Number(i) + 1;
      gigSelectColumn = gigColumn - 1;
      gigPathColumn = gigColumn + 1;
      gigKeywordsColumn = gigPathColumn + 1;
    }
  }
  
  // checkbox values
  var citySelect = inputSheetRange.offset(1, citySelectColumn - 1, inputSheetRange.getLastRow() - 1, 1).getValues();
  var jobSelect = inputSheetRange.offset(1, jobSelectColumn - 1, inputSheetRange.getLastRow() - 1, 1).getValues();
  var gigSelect = inputSheetRange.offset(1, gigSelectColumn - 1, inputSheetRange.getLastRow() - 1, 1).getValues();
  
  // variable update: requires update to front end, check box in cell O2 to search title only.
  var search_title_only = spreadsheet.getRangeByName("search_title_only").getValue();
  
  // filter based on checkbox values
  var cityUrls = inputSheetRange.offset(1, cityColumn - 1, inputSheetRange.getLastRow() - 1, 1).getDisplayValues().filter(function(city, index) {
    return citySelect[index][0];
  });
  var jobPaths = inputSheetRange.offset(1, jobPathColumn - 1, inputSheetRange.getLastRow() - 1, 1).getDisplayValues().filter(function(jobPath, index) {
    return jobSelect[index][0];
  });
  var jobKeywordsValues = inputSheetRange.offset(1, jobKeywordsColumn - 1, inputSheetRange.getLastRow() - 1, 1).getDisplayValues().filter(function(jobKeywords, index) {
    return jobSelect[index][0];
  });
  var gigPaths = inputSheetRange.offset(1, gigPathColumn - 1, inputSheetRange.getLastRow() - 1, 1).getDisplayValues().filter(function(gigPath, index) {
    return gigSelect[index][0];
  });
  var gigKeywordsValues = inputSheetRange.offset(1, gigKeywordsColumn - 1, inputSheetRange.getLastRow() - 1, 1).getDisplayValues().filter(function(gigKeywords, index) {
    return gigSelect[index][0];
  });
  
  const CURRENT_DATE = new Date();
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  var scriptProperties = PropertiesService.getScriptProperties();
  // one-based indices
  // index of keyword currently being processing, by script
  const KEYWORDS_CURRENT_INDEX = "keywords_current";
  // index of city currently being processing, by script
  const CITY_CURRENT_INDEX = "city_current";
  // index of post already processed, for given keyword and city
  const POST_PROCESSED_INDEX = "post_processed";
  
  // posts in last 24 hours
  const POSTS_TWENTY_FOUR_HOURS = "posts_twenty_four_hours";

  var postsTwentyFourHours = Boolean(scriptProperties.getProperty(POSTS_TWENTY_FOUR_HOURS));

  var postsSheetName = "Posts Matched" + (postsTwentyFourHours ? " Today" : "");
  var postsSheet = SpreadsheetApp.getActive().getSheetByName(postsSheetName) || SpreadsheetApp.getActive().insertSheet(postsSheetName);
  // fresh start of script versus continuing previously unfinished work
  if (scriptProperties.getKeys().indexOf(KEYWORDS_CURRENT_INDEX) == -1) {
    // empty all cells
    postsSheet.clear();
    postsSheet.clearFormats();
  }
  var postHeader = ["", "Posted Date", "Today's Date", "Contact", "Craiglist Email", "Ad Title", "Craiglist City", "Post"];
  var jobKeywordsCount = jobKeywordsValues.length;
  var gigKeywordsCount = gigKeywordsValues.length;
  // jobs keywords selected?
  if (jobKeywordsCount) {
    var jobsHeader = postsSheet.getRange(1, 1, 1, jobKeywordsCount * postHeader.length);
    jobsHeader.setBackground("#4682B4");
    jobsHeader.setFontColor("white");
    jobsHeader.setFontWeight('bold');
    jobsHeader.offset(0, 0, 1, 1).setValue("Jobs");
  }
  // gigs keywords selected?
  if (gigKeywordsCount) {
    // include one-column gap between Jobs and Gigs columns
    var gigsHeaderColumn = jobKeywordsCount * postHeader.length + 1 + (jobKeywordsCount ? 1 : 0);
    var gigsHeader = postsSheet.getRange(1, gigsHeaderColumn, 1, gigKeywordsValues.length * postHeader.length);
    gigsHeader.setBackground("#800080");
    gigsHeader.setFontColor("white");
    gigsHeader.setFontWeight('bold');
    gigsHeader.offset(0, 0, 1, 1).setValue("Gigs");
  }
  
  // identify columns for phone, email and post content
  var contactColumn, emailColumn, postColumn;
  for (var i in postHeader) {
    var header = postHeader[i];
    if (header.search(/contact/i) >= 0) {
      contactColumn = Number(i) + 1;
    } else if (header.search(/email/i) >= 0) {
      emailColumn = Number(i) + 1;
    } else if (header.search(/(^|\W)post($|\W)/i) >= 0) {
      postColumn = Number(i) + 1;
    }
  }
  
  // combine jobs and gigs objects
  var jobGigs = jobPaths.map(function(path, index) {
    return {
      'path' : path[0].trim()
      , 'keywords' : jobKeywordsValues[index][0].trim()
      , 'type' : 'job'
    };
  }).concat(gigPaths.map(function(path, index) {
    return {
      'path' : path[0].trim()
      , 'keywords' : gigKeywordsValues[index][0].trim()
      , 'type' : 'gig'
    }}));
  
  // start from first keyword and city, or where left off previously
  var keywordsCurrentIndex = Number(scriptProperties.getProperty(KEYWORDS_CURRENT_INDEX)) || 1;
  var cityCurrentIndex = Number(scriptProperties.getProperty(CITY_CURRENT_INDEX)) || 1;
  var postProcessedIndex = Number(scriptProperties.getProperty(POST_PROCESSED_INDEX)) || 0;

  for (;keywordsCurrentIndex <= jobGigs.length;keywordsCurrentIndex++) {
    scriptProperties.setProperty(KEYWORDS_CURRENT_INDEX, keywordsCurrentIndex);
    var jobGigKeywords = jobGigs[keywordsCurrentIndex - 1].keywords;
    var jobGigPath = jobGigs[keywordsCurrentIndex - 1].path;
    var jobGigType = jobGigs[keywordsCurrentIndex - 1].type;
    
    postHeader[0] = jobGigKeywords;
    
    // start of a new keyword
    var keywordsColumn = postHeader.length * (keywordsCurrentIndex - 1);
    keywordsColumn += jobGigType.match(/job/i) ? 0 : (jobKeywordsCount ? 1 : 0);
    var postHeaderRange = postsSheet.getDataRange().offset(1, keywordsColumn, 1, postHeader.length);
    
    // variable update to imporve visibility.
    var prevColor = "";
    if(keywordsColumn > 7)
      prevColor = postsSheet.getDataRange().offset(1, keywordsColumn - 1).getBackground();
    
    postHeaderRange.setValues([postHeader]);
    postHeaderRange.setHorizontalAlignment("center");
    postHeaderRange.setBackground(prevColor == "#ffff00" ? "#00ffff" : "#ffff00");
    postHeaderRange.setFontWeight('bold');
    postsSheet.autoResizeColumns(postHeaderRange.getLastColumn() - postHeader.length + 2, postHeader.length -1);
    // hide post content
    postsSheet.hideColumns(postHeaderRange.getColumn() + postColumn - 1);
    // skip empty keywords and paths
    if (!jobGigKeywords || !jobGigPath) {
      continue;
    }
    // individual, non-empty words in keyword
    jobGigKeywords = jobGigKeywords.split(",").filter(Boolean);
    var keywordsRegExp = jobGigKeywords.map(function(keyword) {
      return new RegExp(keyword, "i");
    });

    for (;cityCurrentIndex <= cityUrls.length;cityCurrentIndex++) {
      scriptProperties.setProperty(CITY_CURRENT_INDEX, cityCurrentIndex);
      var cityUrl = cityUrls[cityCurrentIndex - 1][0].trim();
      // skip empty url
      if (!cityUrl) {
        continue;
      }
      var jobGigUrl = cityUrl + jobGigPath;
      if (cityUrl.lastIndexOf("/") == (cityUrl.length - 1) && jobGigPath.indexOf("/") == 0) {
        jobGigUrl = cityUrl.substring(0, cityUrl.length - 1) + jobGigPath;
      }
      
      var postDateCurrentObj = null;
      
      var postsBrowsedIndex = 0;
      // navigate to each page of lists of jobs/gigs
      while(true) {
        try {
          var httpResponse = UrlFetchApp.fetch(jobGigUrl, {"muteHttpExceptions" : true});
          if (httpResponse.getResponseCode() == 200) {
            var jobGig = httpResponse.getContentText();
            var $ = Cheerio.load(jobGig);
            // skip jobs/gigs in neighbourhood
            var resultInfos = $(".result-info:not(:has(.nearby))");
            var postDateCurrent;
            for(var postLinksIndex = 0;postLinksIndex < resultInfos.length;postLinksIndex++) {
              postsBrowsedIndex++;
              // skip posts already processed, in previous run of script
              if (postsBrowsedIndex <= postProcessedIndex) {
                continue;
              }
              var resultInfo = resultInfos.eq(postLinksIndex);
              postDateCurrent = $(">time", resultInfo).attr("datetime");
              if (postsTwentyFourHours) {
                postDateCurrentObj = new Date(postDateCurrent.replace(/\s/, "T"));
                if (postDateCurrentObj.getTime() < yesterday.getTime()) {
                  break;
                }
              }
              var postLink = $(">a", resultInfo);
              var postUrl = postLink.attr("href");
              var postId = postLink.data("id");
              var postTitle = postLink.text();
              try {
                var httpResponse = UrlFetchApp.fetch(postUrl, {"muteHttpExceptions" : true});
                if (httpResponse.getResponseCode() == 200) {
                  var postContent = httpResponse.getContentText();
                  var postContent = Cheerio.load(postContent);
                  var postBodyText = postContent("body").text();
                  
                  // variable updated: now it based on selection of checkbox O2 on input sheet keywords will be matched by title only or post body.
                  var keywordsMatch = search_title_only ? keywordsRegExp.some(function(keywordRegExp) {
                    return keywordRegExp.test(postTitle);
                  }) : keywordsRegExp.some(function(keywordRegExp) {
                    return keywordRegExp.test(postBodyText);
                  });
                  
                  if (keywordsMatch) {
                    var contacts = postBodyText.match(/(\d{3}[-\.\s]??\d{3}[-\.\s]??\d{4}|\(\d{3}\)\s*\d{3}[-\.\s]??\d{4})/g);
                    contacts = contacts ? contacts : [];
                    contacts = contacts.filter(function(contact, index, self){ return self.indexOf(contact) === index && contact != postId;})
                    contacts = contacts.length ? contacts.join(", ") : "";
                    var emails = postBodyText.match(/[\w\-\.\+]+\@[a-zA-Z0-9\.\-]+\.[a-zA-z0-9]{2,4}/g);
                    emails = emails ? emails : [];
                    var email = "";
                    var emailLinkPath = postContent(".reply-button").data("href");
                    if (emailLinkPath) {
                      try {
                        var httpResponse = UrlFetchApp.fetch(cityUrl + emailLinkPath.replace("/__SERVICE_ID__", "contactinfo"), {"muteHttpExceptions" : true});
                        if (httpResponse.getResponseCode() == 200) {
                          var emailLinkContent = JSON.parse(httpResponse.getContentText()).replyContent;
                          var emailLinkContent = Cheerio.load(emailLinkContent);
                          email = emailLinkContent(".reply-email-address a").text();
                        }
                      } catch(e) {
                        logMessage(e, logSheet);
                      }
                    }
                    
                    if (email.trim()) {
                      emails.push(email);
                    }
                    emails = emails.filter(function(email, index, self){ return self.indexOf(email) === index;})
                    emails = emails ? emails.join(", ") : "";
                    var hood = $(".result-hood", resultInfo).text().replace(/\((.*)\)/, "$1");
                    // skip last column Post
                    var postDataRange = postHeaderRange.offset(0, 0,
                                                               postHeaderRange.getNumRows(), postHeaderRange.getNumColumns() - 1).getDataRegion(SpreadsheetApp.Dimension.ROWS);
                    // include last column Post
                    postDataRange = postDataRange.offset(0, 0, postDataRange.getNumRows(), postDataRange.getNumColumns() + 1);
                    var postRange = postDataRange.offset(postDataRange.getNumRows(), 0, 1, postDataRange.getNumColumns());
                    postRange.setValues([[postUrl, postDateCurrent, CURRENT_DATE, contacts, emails, postTitle, hood, postBodyText]]);
                    scriptProperties.setProperty(POST_PROCESSED_INDEX, ++postProcessedIndex);
                    // skip auto-resizing post link column
                    postsSheet.autoResizeColumns(postDataRange.getLastColumn() - postHeader.length + 2, postHeader.length - 1);
                    // format post link
                    postRange.setFontLine("none");
                    postRange.setFontColor("black");
                    postDataRange = postDataRange.offset(0, 0, postDataRange.getNumRows() + 1, postDataRange.getNumColumns());
                  } else {
                    scriptProperties.setProperty(POST_PROCESSED_INDEX, ++postProcessedIndex);
                  }
                } else {
                  scriptProperties.setProperty(POST_PROCESSED_INDEX, ++postProcessedIndex);
                }
              } catch(e) {
                scriptProperties.setProperty(POST_PROCESSED_INDEX, ++postProcessedIndex);
                logMessage(e, logSheet);
              }
            }
            if (postsTwentyFourHours) {
              postDateCurrentObj = new Date(postDateCurrent.replace(/\s/, "T"));
              if (postDateCurrentObj.getTime() < yesterday.getTime()) {
                break;
              }
            }
            var nextPageLink = $("a.next").attr("href").trim();
            if (nextPageLink) {
              if (nextPageLink.indexOf("/") == 0) {
                jobGigUrl = jobGigUrl.split("/", 3).join("/") + nextPageLink;
              } else {
                var urlParts = jobGigUrl.split("/");
                urlParts.splice(urlParts.length - 1, 1, nextPageLink);
                jobGigUrl = urlParts.join("/");
              }
              postLinksIndex = 0;
            } else {
              // all pages of posts are processed
              break;
            }
          }
        } catch(e) {
          logMessage(e, logSheet);
          break;
        }
      }
      postProcessedIndex = 0;
      scriptProperties.setProperty(POST_PROCESSED_INDEX, postProcessedIndex);
    }
    cityCurrentIndex = 1
    scriptProperties.setProperty(CITY_CURRENT_INDEX, cityCurrentIndex);
  }
}

function addHeader(sheet, header) {
  var headerRange = sheet.getRange(1, 1, 1, header.length);
  headerRange.setValues([header]);
  sheet.autoResizeColumns(1, header.length);
  headerRange.setHorizontalAlignment("center");
  headerRange.setBackground("yellow");
  headerRange.setFontWeight('bold');
}

function insertSheet(name, header) {
  var sheet = SpreadsheetApp.getActive().insertSheet(name);
  addHeader(sheet, header);
  return sheet;
}

function logMessage(message, logSheet) {
  var messageFormatted = message.message && message.name && message.fileName && message.lineNumber ? 
    Utilities.formatString("[%s %s %s] %s", message.name, message.fileName, message.lineNumber, message.message) : message;
  var logRange = logSheet.getDataRange();
  logRange.offset(logSheet.getLastRow(), 0, 1, 2).setValues([[new Date(), messageFormatted]]);
  logSheet.autoResizeColumns(1, 2);
}

function resetScript(triggerFunctionNameRegExp) {
  var scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.deleteAllProperties();
  // delete triggers for fetching posts
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var trigger = triggers[i];
    var triggerHandlerFunction = trigger.getHandlerFunction();
    if (triggerHandlerFunction && triggerFunctionNameRegExp.test(triggerHandlerFunction) &&
      trigger.getEventType() == ScriptApp.EventType.CLOCK) {
        ScriptApp.deleteTrigger(trigger);
      }
  }
}

// select all cities
function selectCities() {
  selectUnselectCities(true);
}

// select all cities
function selectUnselectCities(selectCity) {
  var spreadsheet = SpreadsheetApp.getActive();
  
  // input sheet
  var inputSheet = spreadsheet.getSheets().filter(function(sheet) {
    return new RegExp("(^|\W)input($|\W)", "i").test(sheet.getName());
  })[0];
  var inputSheetRange = inputSheet.getDataRange();
  var inputSheetHeaders = inputSheetRange.offset(0, 0, 1).getDisplayValues()[0];
  
  // identify columns based on headers
  var citySelectColumn;
  for (var i in inputSheetHeaders) {
    var header = inputSheetHeaders[i];
    if (header.search(/cities/i) >= 0) {
      citySelectColumn = i;
    }
  }
  
  var citySelectRange = inputSheetRange.offset(1, citySelectColumn - 1, inputSheetRange.getLastRow() - 1, 1);
  citySelectRange.setValue(selectCity);
}

// select all cities
function unselectCities() {
  selectUnselectCities(false);
}

// helpers
function getColor(){
  Logger.log(SpreadsheetApp.getActive().getSheetByName("Posts Matched").getRange(2, 1).getBackground());
}