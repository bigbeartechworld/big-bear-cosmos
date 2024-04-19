const { exec } = require("child_process");
const path = require("path");
const https = require("https");
const fs = require("fs");
const yaml = require("yaml");

// Function to clone the GitHub repository
function cloneRepo(repoUrl, targetFolder) {
  return new Promise((resolve, reject) => {
    // Construct the full clone command
    const command = `git clone ${repoUrl} ${targetFolder}`;

    console.log("Cloning the repository...");

    // Execute the command
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.log(`Error: ${stderr}`);
        // Decide whether stderr should cause a reject or not
      }
      console.log(`Repository cloned successfully:\n${stdout}`);
      resolve(stdout); // Resolve the promise once cloning is done
    });
  });
}

async function scanFiles(folder) {
  console.log("Scanning folder: " + folder);
  // list all the folders in the target folder
  const folders = fs.readdirSync(folder);
  const foldersSub = [];

  for (const subfolder of folders) {
    const subfolderPath = path.join(folder, subfolder);
    const files = fs.readdirSync(subfolderPath);
    for (const file of files) {
      if (file === "docker-compose.yml") {
        foldersSub[subfolder] = subfolderPath;
      }
    }
  }

  return foldersSub;
}

function composeConvert(input) {
  // change $AppID to {ServiceName}
  let output = input.replace(/\$AppID/g, "{ServiceName}");
  output = output.replace(/\$PGID/g, "1000");
  output = output.replace(/\$PUID/g, "1000");
  output = output.replace(/\$TZ/g, "auto");

  // change source: /DATA/AppData/ to source: {DefaultDataPath}/
  // output = output.replace(/source: \/DATA\/AppData\//g, 'source: \\{DefaultDataPath}/');

  // add store
  output = `cosmos-installer:\n${output}`;

  // parse yml
  const doc = yaml.parse(output);

  // convert services names to {ServiceName}-name
  for (const [name, service] of Object.entries(doc.services)) {
    let newName = "{ServiceName}-" + name;
    if (Object.entries(doc.services).length === 1) {
      newName = "{ServiceName}";
    }

    service.container_name = newName;
    service.hostname = newName;

    let volumeIndex = 1;

    // convert volumes
    service.volumes =
      service.volumes &&
      service.volumes.map((volume) => {
        // if string, replace
        if (typeof volume === "string") {
          if (volume.startsWith("/DATA/AppData/")) {
            const r =
              newName + "-data" + (volumeIndex === 1 ? "" : `-${volumeIndex}`);
            volumeIndex++;
            return r + ":" + volume.split(":")[1];
          }
          return volume.replace("/DATA/", "{DefaultDataPath}/");
        } else if (typeof volume === "object") {
          // if object, replace source
          if (volume.source.startsWith("/DATA/AppData/")) {
            volume.source =
              newName + "-data" + (volumeIndex === 1 ? "" : `-${volumeIndex}`);
            volumeIndex++;
          } else {
            volume.source = volume.source.replace(
              "/DATA/",
              "{DefaultDataPath}/"
            );
          }
          volume.type = volume.source[0] === "/" ? "bind" : "volume";
          return volume;
        }
      });

    // convert ports
    service.ports =
      service.ports &&
      service.ports.map((port) => {
        // if string, replace
        if (typeof port === "object") {
          return port.protocol
            ? `${port.published}:${port.target}/${port.protocol}`
            : `${port.published}:${port.target}`;
        } else {
          return port;
        }
      });

    const varsToPrefix = [
      "POSTGRES_HOST",
      "MONGO_HOST",
      "REDIS_HOST",
      "DB_HOST",
    ];

    // Handle environment variable modifications
    if (service.environment) {
      if (Array.isArray(service.environment)) {
        service.environment = service.environment.map((env) => {
          const [key, value] = env.split("=");
          if (varsToPrefix.includes(key)) {
            return `${key}={ServiceName}-` + value;
          }
          return env;
        });
      } else if (typeof service.environment === "object") {
        Object.keys(service.environment).forEach((key) => {
          if (varsToPrefix.includes(key)) {
            service.environment[key] =
              `{ServiceName}-` + service.environment[key];
          }
        });
      }
    }

    // Handle environment variable modifications
    if (service.environment) {
      if (Array.isArray(service.environment)) {
        service.environment = service.environment.map((env) => {
          if (env.startsWith("MONGO_HOST=")) {
            const parts = env.split("=");
            return `MONGO_HOST={ServiceName}-` + parts[1];
          }
          return env;
        });
      } else if (typeof service.environment === "object") {
        Object.keys(service.environment).forEach((key) => {
          if (key === "MONGO_HOST") {
            service.environment[key] =
              `{ServiceName}-` + service.environment[key];
          }
        });
      }
    }

    // Correctly handle depends_on with {ServiceName}- prefix
    if (service.depends_on) {
      if (
        typeof service.depends_on === "object" &&
        !Array.isArray(service.depends_on)
      ) {
        service.depends_on = Object.keys(service.depends_on).map(
          (key) => `{ServiceName}-` + key
        );
      } else if (Array.isArray(service.depends_on)) {
        service.depends_on = service.depends_on.map(
          (dep) => `{ServiceName}-` + dep
        );
      }
    }

    delete service["x-casaos"];

    doc.services[newName] = service;
    delete doc.services[name];
  }

  doc["minVersion"] = "0.14.0";

  delete doc["x-casaos"];

  return yaml.stringify(doc);
}

function descriptionConvert(name, input) {
  const doc = yaml.parse(input)["x-casaos"];

  let output = {
    name: name,
    description: (doc.tagline || doc.overview || doc.description).en_us,
    longDescription: (doc.description || doc.overview || doc.tagline).en_us,
    tags: [doc.category],
    repository: "https://github.com/bigbeartechworld/big-bear-casaos",
    image: doc.icon,
    supported_architectures: doc.architectures,
    icon: doc.icon,
  };

  let screenshots = doc.screenshot_link
    ? doc.screenshot_link.map((screenshot, index) => {
        return screenshot.split("/").pop();
      })
    : [];

  return [output, screenshots, doc.icon.split("/").pop()];
}

function downloadImage(url, filePath, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    // Function to handle the download process
    const download = (url, filePath, remainingRedirects) => {
      const file = fs.createWriteStream(filePath);

      console.log(`Downloading ${url} to ${filePath}`);
      https
        .get(url, (response) => {
          // Check for redirect
          if (
            [301, 302, 307, 308].includes(response.statusCode) &&
            response.headers.location
          ) {
            console.log(`Redirected to ${response.headers.location}`);
            if (remainingRedirects > 0) {
              // Close and delete the current file stream before redirecting
              file.close(() => {
                fs.unlink(filePath, () => {}); // Ignore unlink error
                // Follow the redirect
                download(
                  response.headers.location,
                  filePath,
                  remainingRedirects - 1
                );
              });
            } else {
              reject(new Error("Too many redirects"));
            }
          } else if (response.statusCode === 200) {
            console.log(`Downloaded ${url} to ${filePath}`);
            response.pipe(file);
            file.on("finish", () => {
              console.log(`File downloaded and saved to ${filePath}`);
              fs.exists(filePath, (exists) => {
                console.log(`File exists: ${exists}`);
                if (exists) {
                  resolve(filePath);
                } else {
                  reject(new Error("File was not created"));
                }
              });
            });
          } else {
            file.close(() => {
              fs.unlink(filePath, () =>
                reject(
                  new Error(`Server responded with ${response.statusCode}`)
                )
              ); // Delete the file async and reject
            });
          }
        })
        .on("error", (err) => {
          // Close and delete the file stream on request error
          file.close(() => {
            fs.unlink(filePath, () => reject(err)); // Delete the file async and reject
          });
        });
    };

    // Start the download process
    download(url, filePath, maxRedirects);
  });
}

function extractImages(folder) {
  // list all the images (png, jpg, jpeg, ico) that start with screenshot
  const images = fs.readdirSync(folder);
  const imagesSub = [];
  let icon = "";

  console.log({ images });

  for (const image of images) {
    if (
      image.endsWith(".png") ||
      image.endsWith(".webp") ||
      image.endsWith(".jpg") ||
      image.endsWith(".jpeg") ||
      image.endsWith(".ico")
    ) {
      if (image.startsWith("screenshot")) {
        imagesSub.push(image);
      } else if (image.startsWith("icon: ")) {
        icon = image;
      }
    }
  }

  return [imagesSub, icon];
}

// Example usage
const repoUrl = "https://github.com/bigbeartechworld/big-bear-casaos";
const targetFolder = path.join(__dirname, "casaos");

async function run() {
  console.log("Starting to clone the repository...");
  await cloneRepo(repoUrl, targetFolder);

  console.log("Cloned the repository, analysing the files...");
  const composeFiles = await scanFiles(path.join(targetFolder, "Apps"));

  console.log(
    "Exporting " +
      Object.keys(composeFiles).length +
      " docker-compose.yml files..."
  );
  // if output folder exist, remove it
  if (fs.existsSync(path.join(__dirname, "servapps"))) {
    fs.rmSync(path.join(__dirname, "servapps"), { recursive: true });
  }

  for (const [name, appPath] of Object.entries(composeFiles)) {
    try {
      const data = composeConvert(
        fs.readFileSync(path.join(appPath, "docker-compose.yml"), "utf8")
      );
      const [description, _, _1] = descriptionConvert(
        name,
        fs.readFileSync(path.join(appPath, "docker-compose.yml"), "utf8")
      );
      const [screenshots, icon] = extractImages(appPath);

      // create folders
      fs.mkdirSync(path.join(__dirname, "servapps", name, "screenshots"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(__dirname, "servapps", name, "docker-compose.yml"),
        data
      );
      fs.writeFileSync(
        path.join(__dirname, "servapps", name, "description.json"),
        JSON.stringify(description, null, 2)
      );
      const iconUrl = description.icon; // Assuming this is the extracted icon URL from the YAML
      const iconPath = path.join(__dirname, "servapps", name, "icon.png"); // Define the path where you want to save the icon

      try {
        await downloadImage(iconUrl, iconPath);
        console.log(`Downloaded icon for ${name}`);
      } catch (error) {
        console.error(`Failed to download icon for ${name}:`, error);
      }

      for (let i = 0; i < screenshots.length; i++) {
        fs.copyFileSync(
          path.join(appPath, screenshots[i]),
          path.join(__dirname, "servapps", name, "screenshots", screenshots[i])
        );
      }
      //   fs.copyFileSync(
      //     path.join(appPath, icon),
      //     path.join(__dirname, "servapps", name, "icon.png")
      //   );
    } catch (err) {
      console.error("error with " + name + ": " + err);
    }
  }
}

run();
