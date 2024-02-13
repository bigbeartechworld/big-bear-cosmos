// Importing the required modules
const fs = require("fs"); // File system module for file operations
const { config } = require("process"); // Process module for handling system processes
const configFile = require("./config.json"); // Loading configuration from a JSON file

// This block lists all directories in the directory 'servapps' and compiles them in 'servapps.json'
const servapps = fs
  .readdirSync("./servapps") // Read the contents of the directory 'servapps'
  .filter((file) => fs.lstatSync(`./servapps/${file}`).isDirectory()); // Filter out only directories

let servappsJSON = []; // Initialize an array to store JSON data of servapps

// Iterating over each directory in the servapps directory
for (const file of servapps) {
  const servapp = require(`./servapps/${file}/description.json`); // Load the description JSON for each servapp
  servapp.id = file; // Assign the directory name as the ID
  servapp.screenshots = []; // Initialize an array for storing screenshot URLs
  servapp.artefacts = {}; // Initialize an object for storing artefacts

  // Process screenshots: list all screenshots in the directory 'servapps/${file}/screenshots'
  if (fs.existsSync(`./servapps/${file}/screenshots`)) {
    // Check if the screenshots directory exists
    const screenshots = fs.readdirSync(`./servapps/${file}/screenshots`);
    for (const screenshot of screenshots) {
      // Store the URL of each screenshot
      servapp.screenshots.push(
        `https://cosmos.bigbeartechworld.com/servapps/${file}/screenshots/${screenshot}`
      );
    }
  } else {
    console.log(`No screenshots directory found for servapp ${file}.`);
  }

  // Process artefacts: if artefacts directory exists, list all artefacts
  if (fs.existsSync(`./servapps/${file}/artefacts`)) {
    const artefacts = fs.readdirSync(`./servapps/${file}/artefacts`);
    for (const artefact of artefacts) {
      // Store the URL of each artefact
      servapp.artefacts[
        artefact
      ] = `https://cosmos.bigbeartechworld.com/servapps/${file}/artefacts/${artefact}`;
    }
  }

  // Setting the icon and compose file URLs
  servapp.icon = `https://cosmos.bigbeartechworld.com/servapps/${file}/icon.png`;
  servapp.compose = `https://cosmos.bigbeartechworld.com/servapps/${file}/cosmos-compose.json`;

  // Add the servapp information to the array
  servappsJSON.push(servapp);
}

// Selecting apps for showcasing
const _sc = []; // Initialize an empty array for showcase IDs
const showcases = servappsJSON.filter((app) => _sc.includes(app.name)); // Filter apps for showcase

let apps = {
  source: configFile.url, // Set the source URL from the config file
  showcase: showcases, // Set the selected apps for showcase
  all: servappsJSON, // Include all apps
};

// Writing the servapps data to 'servapps.json' and 'index.json'
fs.writeFileSync("./servapps.json", JSON.stringify(servappsJSON, null, 2)); // Write to 'servapps.json' with pretty formatting
fs.writeFileSync("./index.json", JSON.stringify(apps, null, 2)); // Write to 'index.json' with pretty formatting

// Updating URLs for a test environment
for (const servapp of servappsJSON) {
  // Update the compose and icon URLs to point to the local server
  servapp.compose = `http://localhost:3000/servapps/${servapp.id}/cosmos-compose.json`;
  servapp.icon = `http://localhost:3000/servapps/${servapp.id}/icon.png`;

  // Update screenshot URLs to point to the local server
  for (let i = 0; i < servapp.screenshots.length; i++) {
    servapp.screenshots[i] = servapp.screenshots[i].replace(
      "https://cosmos.bigbeartechworld.com",
      "http://localhost:3000"
    );
  }

  // Update artefact URLs to point to the local server
  for (const artefact in servapp.artefacts) {
    servapp.artefacts[artefact] = servapp.artefacts[artefact].replace(
      "https://cosmos.bigbeartechworld.com",
      "http://localhost:3000"
    );
  }
}

// Writing the modified apps data to 'servapps_test.json'
fs.writeFileSync("./servapps_test.json", JSON.stringify(apps, null, 2)); // Write to 'servapps_test.json' with pretty formatting
