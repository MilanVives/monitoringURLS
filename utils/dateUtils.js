function parseSubmissionTime(submissionTime) {
  // Try native Date first — handles ISO 8601 from Power Automate webhooks
  let d = new Date(submissionTime);
  if (!isNaN(d.getTime())) return d;

  // Fall back to DD-MM-YYYY HH:MM (CSV export format)
  const [datePart, timePart] = submissionTime.split(' ');
  if (datePart && timePart) {
    const [day, month, year] = datePart.split('-');
    const [hours, minutes] = timePart.split(':');
    d = new Date(year, month - 1, day, hours, minutes);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function getTimeDifference(submissionTime) {
  try {
    const subDate = parseSubmissionTime(submissionTime);
    if (!subDate) throw new Error(`Unrecognised date format: "${submissionTime}"`);
    const diffMs = Date.now() - subDate.getTime();
    return {
      days: Math.floor(diffMs / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    };
  } catch (error) {
    console.error('[dateUtils]', error.message);
    return null;
  }
}

module.exports = { getTimeDifference }; 