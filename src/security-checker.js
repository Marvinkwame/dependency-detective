import axios from "axios";

export async function checkVulnerabilities(dependencies) {
  if (!process.env.SNYK_API_TOKEN) {
    return null;
  }

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

async function checkPackageVulnerabilities(packageName, version) {
  try {
    const response = await axios.get(
      `https://snyk.io/api/v1/test/npm/${packageName}/${version}`,
      {
        headers: {
          Authorization: `token ${process.env.SNYK_API_TOKEN}`,
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
