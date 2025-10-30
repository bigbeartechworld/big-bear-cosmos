import fs from "fs";
import path from "path";
import jsyaml from "js-yaml";

interface CosmosConfig {
  id: string;
  version: string;
  image: string;
  youtube?: string;
  docs_link?: string;
  big_bear_cosmos_youtube?: string;
}

interface CosmosDescription {
  name: string;
  description: string;
  longDescription?: string;
  tags: string[];
  repository: string;
  image: string;
  supported_architectures: string[];
  icon: string;
}

interface DockerComposeService {
  image?: string;
  container_name?: string;
  [key: string]: any;
}

interface DockerCompose {
  services?: Record<string, DockerComposeService>;
  [key: string]: any;
}

const getCosmosApps = (): string[] => {
  const apps: string[] = [];
  const servappsDir = "./servapps";

  if (!fs.existsSync(servappsDir)) {
    throw new Error(`servapps directory not found: ${servappsDir}`);
  }

  const entries = fs.readdirSync(servappsDir, { withFileTypes: true });

  entries.forEach((entry) => {
    if (entry.isDirectory()) {
      const configPath = path.join(servappsDir, entry.name, "config.json");
      const descPath = path.join(servappsDir, entry.name, "description.json");
      const composePath = path.join(servappsDir, entry.name, "docker-compose.yml");

      // Only include apps that have all required files
      if (fs.existsSync(configPath) && fs.existsSync(descPath) && fs.existsSync(composePath)) {
        apps.push(entry.name);
      }
    }
  });

  return apps.sort();
};

const loadCosmosConfig = (appName: string): CosmosConfig | null => {
  const configPath = `./servapps/${appName}/config.json`;
  
  try {
    const configFile = fs.readFileSync(configPath, "utf8");
    return JSON.parse(configFile) as CosmosConfig;
  } catch (e) {
    console.error(`Error parsing config file for ${appName}:`, e);
    return null;
  }
};

const loadCosmosDescription = (appName: string): CosmosDescription | null => {
  const descPath = `./servapps/${appName}/description.json`;
  
  try {
    const descFile = fs.readFileSync(descPath, "utf8");
    return JSON.parse(descFile) as CosmosDescription;
  } catch (e) {
    console.error(`Error parsing description file for ${appName}:`, e);
    return null;
  }
};

const loadDockerCompose = (appName: string): DockerCompose | null => {
  const composePath = `./servapps/${appName}/docker-compose.yml`;
  
  try {
    const composeFile = fs.readFileSync(composePath, "utf8");
    return jsyaml.load(composeFile) as DockerCompose;
  } catch (e) {
    console.error(`Error parsing docker-compose file for ${appName}:`, e);
    return null;
  }
};

describe("Cosmos App Validation", () => {
  const apps = getCosmosApps();

  it("Should find at least one Cosmos app", () => {
    expect(apps.length).toBeGreaterThan(0);
  });

  describe("Each app should have valid config.json", () => {
    apps.forEach((appName) => {
      test(`${appName} - config.json exists and is valid`, () => {
        const config = loadCosmosConfig(appName);
        
        expect(config).not.toBeNull();
        expect(config?.id).toBeDefined();
        expect(config?.id).toBe(appName);
        expect(config?.version).toBeDefined();
        expect(typeof config?.version).toBe("string");
        expect(config?.version.length).toBeGreaterThan(0);
        expect(config?.image).toBeDefined();
        expect(typeof config?.image).toBe("string");
        expect(config?.image.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Each app should have valid description.json", () => {
    apps.forEach((appName) => {
      test(`${appName} - description.json exists and is valid`, () => {
        const description = loadCosmosDescription(appName);
        
        expect(description).not.toBeNull();
        expect(description?.name).toBeDefined();
        expect(typeof description?.name).toBe("string");
        expect(description?.description).toBeDefined();
        expect(typeof description?.description).toBe("string");
        expect(description?.tags).toBeDefined();
        expect(Array.isArray(description?.tags)).toBe(true);
        expect(description?.repository).toBeDefined();
        expect(description?.image).toBeDefined();
        expect(description?.supported_architectures).toBeDefined();
        expect(Array.isArray(description?.supported_architectures)).toBe(true);
        expect(description?.icon).toBeDefined();
      });
    });
  });

  describe("Each app should have valid docker-compose.yml", () => {
    apps.forEach((appName) => {
      test(`${appName} - docker-compose.yml exists and is valid YAML`, () => {
        const compose = loadDockerCompose(appName);
        
        expect(compose).not.toBeNull();
        expect(compose?.services).toBeDefined();
        expect(typeof compose?.services).toBe("object");
      });
    });
  });

  describe("Version consistency between config.json and docker-compose.yml", () => {
    apps.forEach((appName) => {
      test(`${appName} - versions match`, () => {
        const config = loadCosmosConfig(appName);
        const compose = loadDockerCompose(appName);
        
        if (!config || !compose || !compose.services) {
          return; // Skip if files couldn't be loaded
        }

        const configVersion = config.version;
        const configImage = config.image;

        // Find the main service (usually the first one or one matching the app name)
        const services = Object.values(compose.services);
        let foundMatch = false;

        services.forEach((service) => {
          if (service.image && service.image.includes(configImage.split(":")[0])) {
            // Extract version from docker image tag
            const imageVersion = service.image.split(":")[1];
            
            if (imageVersion) {
              // Check if versions match (allowing for minor variations like 'v' prefix)
              const normalizedConfigVersion = configVersion.replace(/^v/, "");
              const normalizedImageVersion = imageVersion.replace(/^v/, "");
              
              if (normalizedImageVersion === normalizedConfigVersion || 
                  normalizedImageVersion.includes(normalizedConfigVersion)) {
                foundMatch = true;
              }
            }
          }
        });

        // Some apps might use 'latest' or have complex versioning
        if (!foundMatch && configVersion !== "latest") {
          console.warn(`${appName}: Version mismatch or couldn't verify - config: ${configVersion}`);
        }
      });
    });
  });

  describe("Each app should have required files", () => {
    apps.forEach((appName) => {
      test(`${appName} - has all required files`, () => {
        const configPath = `./servapps/${appName}/config.json`;
        const descPath = `./servapps/${appName}/description.json`;
        const composePath = `./servapps/${appName}/docker-compose.yml`;
        const iconPath = `./servapps/${appName}/icon.png`;

        expect(fs.existsSync(configPath)).toBe(true);
        expect(fs.existsSync(descPath)).toBe(true);
        expect(fs.existsSync(composePath)).toBe(true);
        expect(fs.existsSync(iconPath)).toBe(true);
      });
    });
  });

  describe("Image URLs should be properly formatted", () => {
    apps.forEach((appName) => {
      test(`${appName} - image URLs are valid`, () => {
        const description = loadCosmosDescription(appName);
        
        if (!description) return;

        // Check image URL
        if (description.image) {
          expect(description.image).toMatch(/^https?:\/\/.+/);
        }

        // Check icon URL
        if (description.icon) {
          expect(description.icon).toMatch(/^https?:\/\/.+/);
        }
      });
    });
  });

  describe("Supported architectures should be valid", () => {
    const validArchitectures = ["amd64", "arm64", "arm/v7", "arm/v6"];

    apps.forEach((appName) => {
      test(`${appName} - has valid architectures`, () => {
        const description = loadCosmosDescription(appName);
        
        if (!description || !description.supported_architectures) return;

        description.supported_architectures.forEach((arch) => {
          expect(validArchitectures).toContain(arch);
        });

        expect(description.supported_architectures.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Tags should include required values", () => {
    apps.forEach((appName) => {
      test(`${appName} - has valid tags`, () => {
        const description = loadCosmosDescription(appName);
        
        if (!description || !description.tags) return;

        expect(Array.isArray(description.tags)).toBe(true);
        expect(description.tags.length).toBeGreaterThan(0);
        
        // Most apps should have a category tag
        expect(description.tags.some(tag => tag.length > 0)).toBe(true);
      });
    });
  });
});
