import axios from "axios";


export async function suggestAlternatives(dependencies) {
  const alternatives = {};
  
  // In a production tool, you'd query actual package data from npm or similar
  // This is a simplified example with mock data
  for (const [depName, version] of Object.entries(dependencies)) {
    try {
      const suggestion = await findBetterAlternative(depName, version);
      if (suggestion) {
        alternatives[depName] = suggestion;
      }
    } catch (error) {
      console.error(`Failed to find alternatives for ${depName}: ${error.message}`);
    }
  }
  
  return alternatives;
}

export async function findBetterAlternative(packageName, version) {
  try {
    // Fetch package data from npm registry
    const npmResponse = await axios.get(`https://registry.npmjs.org/${packageName}`);
    const packageData = npmResponse.data;

    // Check if the package is deprecated
    if (packageData.deprecated) {
      return {
        name: packageName,
        reason: `This package is deprecated: ${packageData.deprecated}`,
        downloads: packageData.downloads || 0,
        lastUpdated: packageData.time.modified,
      };
    }

    // Fetch alternatives from npms.io
    try {
      const alternativesResponse = await axios.get(`https://api.npms.io/v2/package/${packageName}`);
      const alternativesData = alternativesResponse.data;

      if (alternativesData.alternatives && alternativesData.alternatives.length > 0) {
        const bestAlternative = alternativesData.alternatives[0];
        return {
          name: bestAlternative.package.name,
          reason: `Recommended alternative: ${bestAlternative.package.description}`,
          downloads: bestAlternative.package.downloads,
          lastUpdated: bestAlternative.package.date,
        };
      }
    } catch (error) {
      console.error(`No alternatives found for ${packageName} in npms.io: ${error.message}`);
    }

    return null;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.error(`Package ${packageName} not found in npm registry.`);
    } else {
      console.error(`Failed to fetch alternatives for ${packageName}: ${error.message}`);
    }
    return null;
  }
}