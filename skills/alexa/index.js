'use strict';
const DialogFlowSdk = require('apiai');
const AlexaSdk = require('alexa-sdk');
const makePlainText = AlexaSdk.utils.TextUtils.makePlainText;
const makeImage = AlexaSdk.utils.ImageUtils.makeImage;

const DIALOGFLOW_DEV_ACCESS_TOKEN = '<YOUR_ACCESS_TOKEN>';
const ALEXA_APP_ID = '<YOUR_ALEXA_APP_ID>';

const CATCH_ALL_SLOT_NAME = "CatchAllSlot";

const DialogFlow = new DialogFlowSdk(DIALOGFLOW_DEV_ACCESS_TOKEN);


exports.handler = function(event, context) {
    let alexa = AlexaSdk.handler(event, context);
    alexa.appId = ALEXA_APP_ID;
    alexa.registerHandlers(handlers);
    alexa.execute();
};


let alexaSessId;
function setAlexaSessionId(sessionId) {
    if (sessionId.indexOf("amzn1.echo-api.session.") != -1) {
        alexaSessId = sessionId.split('amzn1.echo-api.session.').pop();
    } else {
        alexaSessId = sessionId.split('SessionId.').pop();
    }
}


const helpers = {
    getSpeechFromDFResponse: function(response) {
        console.log("getSpeechFromDFResponse");
        console.log("speech: " + response.result.fulfillment.speech);
        return response.result.fulfillment.speech;
    },

    getTextFromAlexaRequest: function(request) {
        console.log("getTextFromAlexaRequest");
        return request.intent.slots[CATCH_ALL_SLOT_NAME].value;
    },

    isInteractionAlive: function(responseResult) {
        if (responseResult.actionIncomplete) {
            console.log("isInteractionAlive - true");
            return true;
        }

        let contexts = responseResult.contexts;
        console.log("contexts length = " + responseResult.contexts.length);
        for (let i = 0; i < contexts.length; i++)
            if (contexts[i].lifespan > 1) {
                console.log("isInteractionAlive - true");
                return true;
            }

        // console.log("isInteractionAlive - about to die");
        return true;
    },

    sendCardResponse: function(response) {
        let speech = helpers.getSpeechFromDFResponse(response);
        const builder = new AlexaSdk.templateBuilders.BodyTemplate1Builder();
        let template = builder.setTitle("RatioBoard")
                                .setBackgroundImage(makeImage('http://i0.kym-cdn.com/entries/icons/original/000/018/084/noice.png'))
                                .setTextContent(makePlainText(speech))
                                .build();

        if (helpers.isInteractionAlive(response.result)) {
            self.response.speak(speech).listen("");
            self.response.renderTemplate(template);
            self.emit(':responseReady');
            // self.emit(':ask', speech, speech);
        } else {
            self.emit(':tell', speech);
        }
    }
};


const handlers = {
    // required
    'AMAZON.CancelIntent': function() { 
        console.log("Cancel Intent called");
        this.emit('AMAZON.StopIntent');
    },

    // required
    'AMAZON.HelpIntent': function() { 
        console.log("Help Intent called");
        this.emit('Unhandled'); 
    },

    // required
    'AMAZON.StopIntent': function() {
        console.log("Stop Intent called");
        let self = this;
        DialogFlow.eventRequest({name: 'BYE'}, {sessionId: alexaSessId})
            .on('response', function(response) {
                console.log("")
                self.emit(':tell', helpers.getSpeechFromDFResponse(response));
            })
            .on('error', function(error) {
                console.error(error.message);
                self.emit(':tell', error.message);
            })
            .end();
    },

    // convo started
    'LaunchRequest': function() {
        let self = this;
        setAlexaSessionId(self.event.session.sessionId);
        
        console.log("GARREN - LaunchRequest");
        DialogFlow.eventRequest({name: 'WELCOME'}, {sessionId: alexaSessId})
            .on('response', function(response) {
                console.log("Success - response: " + JSON.stringify(response));
                let speech = helpers.getSpeechFromDFResponse(response);
                self.emit(':ask', speech, speech);
            })
            .on('error', function(error) {
                console.error("FUCK - error: " +error.message);
                self.emit(':tell', error.message);
            })
            .end();
    },

    // Alexa couldn't map the user's speech to the `FunnelIntent` intent
    //  if this happens often, a "real" interaction model for Alexa should work better
    'Unhandled': function() {
        let self = this;
        console.log('Unhandled - I have failed :(');
        DialogFlow.eventRequest({name: 'FALLBACK'}, {sessionId: alexaSessId})
            .on('response', function(response) {
                console.log("WHY? - " - response);
                let speech = helpers.getSpeechFromDFResponse(response);
                self.emit(':ask', speech, speech);
            })
            .on('error', function(error) {
                console.error("FUCK - error: " + error.message);
                self.emit(':tell', error.message);
            })
            .end();
    },

    // forward the text that Alexa converted from the user's speech
    'FunnelIntent': function() {
        console.log("FunnelIntent called");
        let self = this;
        setAlexaSessionId(self.event.session.sessionId);

        let text = helpers.getTextFromAlexaRequest(self.event.request);
        console.log(text);
        if (!text) {
            console.log("Funnel Intent - calling unhandled");
            self.emit('Unhandled');
            return;
        }

        DialogFlow.textRequest(text, {sessionId: alexaSessId})
            .on('response', function(response) {
                let speech = helpers.getSpeechFromDFResponse(response);

                if (helpers.isInteractionAlive(response.result)) {
                    self.emit(':ask', speech, speech);
                } else {
                    self.emit(':tell', speech);
                }
            })
            .on('error', function(error) {
                console.error(error.message);
                self.emit(':tell', error.message);
            })
            .end();
    }
};
