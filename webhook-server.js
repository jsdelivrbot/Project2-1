var express = require("express");
var request = require("request");
var bodyParser = require("body-parser");
var mongoose = require("mongoose");

var db = mongoose.connect(process.env.MONGODB_URI);
var Fact = require("./models/facts");

var app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 5000));

// Server index page
app.get("/", function (req, res) {
    res.send("Deployed!");
});

// Facebook Webhook
// Used for verification
app.get("/webhook", function (req, res) {
    if (req.query["hub.verify_token"] === process.env.VERIFICATION_TOKEN) {
        console.log("Verified webhook");
        res.status(200).send(req.query["hub.challenge"]);
    } else {
        console.error("Verification failed. The tokens do not match.");
        res.sendStatus(403);
    }
});

// All callbacks for Messenger will be POST-ed here
app.post("/webhook", function (req, res) {
    // Make sure this is a page subscription
    if (req.body.object == "page") {
        // Iterate over each entry
        // There may be multiple entries if batched
        req.body.entry.forEach(function(entry) {
            // Iterate over each messaging event
            entry.messaging.forEach(function(event) {
                if (event.postback) {
                    processPostback(event);
                } else if (event.message) {
                    processMessage(event);
                }
            });
        });

        res.sendStatus(200);
    }
});

function processPostback(event) {
    var senderId = event.sender.id;
    var payload = event.postback.payload;

    if (payload === "Greeting") {
        // Get user's first name from the User Profile API
        // and include it in the greeting
        request({
            url: "https://graph.facebook.com/v2.6/" + senderId,
            qs: {
                access_token: process.env.PAGE_ACCESS_TOKEN,
                fields: "first_name"
            },
            method: "GET"
        }, function(error, response, body) {
            var greeting = "";
            if (error) {
                console.log("Error getting user's name: " +  error);
            } else {
                var bodyObj = JSON.parse(body);
                name = bodyObj.first_name;
                greeting = "Hi " + name + ". ";
            }
            var message = greeting +  "My name is Fact Bot. If you tell me a category, either a 'date', 'math', 'trivia', or 'year' and a number or 'random'. I will tell you facts about that number. Ex: '5/trivia' or '1950/year' or '6/30/date' or '7/math'";
            sendMessage(senderId, {text: message});
        });
    } else if (payload === "Correct") {
        sendMessage(senderId, {text: "Awesome! What number would you like to know about? Remember to type the number/type. Ex: '5/trivia' or '1950/year' or '6/30/date' or '7/math'"});
    } else if (payload === "Incorrect") {
        sendMessage(senderId, {text: "Have yourself a wonderful day! If you ever want to ask me about another number, just enter it in the chat box."});
    }
}

function processMessage(event) {
    if (!event.message.is_echo) {
        var message = event.message;
        var senderId = event.sender.id;
        
        console.log("Received message from senderId: " + senderId);
        console.log("Message is: " + JSON.stringify(message));

        // You may get a text or attachment but not both
        if (message.text) {
            var formatted = message.text;
            var formattedMsg = formatted.split("/").pop();
            

            switch (formattedMsg) {
                case "trivia":
                case "year":
                case "date":
                case "math":
                    findFact(senderId, formatted);
                    break;

                default:
                randomFact(senderId, formatted);
        }
           
        } 
        else if (message.attachments) {
            sendMessage(senderId, {text: "Sorry, I don't understand your request."});
        }
    }
}

function randomFact(userId, formatted){

    var isnum = false;
    var random;
console.log(formatted);
                isnum = /^\d+$/.test(formatted);
                if(isnum)
                {
                  random = Math.floor(Math.random() * 3);
                 if(random == 0)
                    {formatted += "/trivia";}
                else if (random == 1)
                    {formatted += "/year";}
                else if (random == 2)
                   {formatted += "/math";}
                console.log(formatted);
                findFact(userId, formatted);   
                }

                else
                    sendMessage(senderId, {text: "Sorry, I don't understand your request."});
        

}

function findFact(userId, math) {
    request("http://numbersapi.com/" + math + "?json", function (error, response, body) {
        
        
            var factObj = JSON.parse(body);
            console.log(factObj.found);
            console.log(factObj.number);
            console.log(factObj.text);
            if (factObj.found === true) {
                var query = {user_id: userId};
                var update = {
                    user_id: userId,
                    number: factObj.number,
                    fact_type: factObj.type,
                    number_fact: factObj.text
                };
                var options = {upsert: true};
                Fact.findOneAndUpdate(query, update, options, function(err, mov) {
                    if (err) {
                        console.log("Database error: " + err);
                    } else {
                        
                        sendMessage(userId, {text:factObj.text});
                       
                        message = {
                            attachment: {
                                type: "template",
                                payload: {
                                    template_type: "generic",
                                    elements: [{
                                        title: "Want to try again?",
                                        buttons: [{
                                            type: "postback",
                                            title: "Yes",
                                            payload: "Correct"
                                        }, {
                                            type: "postback",
                                            title: "No",
                                            payload: "Incorrect"
                                        }]
                                    }]
                                }
                            }
                        };
                        
                        sendMessage(userId, message);
                    }
                });
            } 
            
         else {
            sendMessage(userId, {text: "Something went wrong. Try again."});
        }
    });
}

// sends message to user
function sendMessage(recipientId, message) {
    request({
        url: "https://graph.facebook.com/v2.6/me/messages",
        qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
        method: "POST",
        json: {
            recipient: {id: recipientId},
            message: message,
        }
    }, function(error, response, body) {
        if (error) {
            console.log("Error sending message: " + response.error);
        }
    });
}