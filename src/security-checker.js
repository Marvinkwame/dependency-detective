import https from "https";
import axios from "axios";

export async function checkVulnerabilities(dependencies) {
  const vulnerabilities = {};

  for (const [depName, version] of Object.entries(dependencies)) {
    try {
      const issues = await checkPackageVulnerabilities(depName, version);
      if (issues.length > 0) {
        vulnerabilities[depName] = issues;
      }
    } catch (error) {
      console.error(
        `Failed to check vulnerabilities for ${depName}: ${error.message}`
      );
    }
  }

  return vulnerabilities;
}

export async function checkPackageVulnerabilities(packageName, version) {
  try {
    const SNYK_API_TOKEN = process.env.SNYK_API_TOKEN; // Ensure you set this environment variable
    if (!SNYK_API_TOKEN) {
      throw new Error(
        "Snyk API token is missing. Please set the SNYK_API_TOKEN environment variable."
      );
    }

    const response = await axios.get(
      `https://snyk.io/api/v1/test/npm/${packageName}/${version}`,
      {
        headers: {
          Authorization: `token ${SNYK_API_TOKEN}`,
        },
      }
    );

    const vulnerabilities = response.data.issues.vulnerabilities;

    return vulnerabilities.map((vuln) => ({
      severity: vuln.severity,
      title: vuln.title,
      description: vuln.description,
    }));
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.error(
        `Failed to authenticate with Snyk API. Please check your SNYK_API_TOKEN.`
      );
    } else if (error.response && error.response.status === 404) {
      console.error(`Package ${packageName} not found in Snyk database.`);
    } else {
      console.error(
        `Failed to fetch vulnerabilities for ${packageName}: ${error.message}`
      );
    }
    return [];
  }
}
