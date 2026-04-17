const File = require("./File.model");

// Separate function to handle searching and pagination
async function sendSearchResults(bot, query, page = 1, ITEMS_PER_PAGE = 8) {
  try {
    const skip = (page - 1) * ITEMS_PER_PAGE;

    // Search criteria using the text index
    const searchCriteria = { $text: { $search: query } };

    // Get total count for pagination math
    const totalResults = await File.countDocuments(searchCriteria);
    const results = await File.find(searchCriteria)
      .skip(skip)
      .limit(ITEMS_PER_PAGE);
    const totalPages = Math.ceil(totalResults / ITEMS_PER_PAGE);

    return {
      results,
      totalPages,
      currentPage: page,
      totalResults,
      Query: query,
    };
  } catch (error) {
    console.error("Search Error:", error);
    bot.sendMessage(
      chatId,
      "An error occurred while searching. Please try again."
    );
  }
}

module.exports = sendSearchResults;
