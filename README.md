# TalkaDoodleDoo
An advanced confluence of computational algorithms and acoustic interfacing - designed to emulate human vocal interaction through artificial linguistic synthesis and auditory processing.

## Clone the Repository:
<code> git clone https://github.com/rajaravindp/talkadoodledoo.git </code>

## Install Dependencies:
<code> npm install -y </code> <br>
<code> npm i @google-cloud/speech @google-cloud/text-to-speech chalk dotenv events node-record-lpcm16 openai </code> 

## Configure API Keys:
Create a .env file with the necessary API credentials. <br>
<li> OpenAI api-key </li>
<li> Google cloud application credentials </li>

## Instructions for setting up Google application credentials:  
<li> Enable Cloud Speech-to-Text and Cloud Text-to-Speech via the Google cloud console. </li>
<li> Obtain your service account JSON key file from Google Cloud Console. </li>
<li> Set the environment variable to point to the JSON file. </li>

## Run the Application:
<code> npm start </code>

