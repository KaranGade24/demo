exports.inlineKeboard = (
  chatId,
  bot,
  results,
  totalPages,
  currentPage,
  totalResults
) => {

  const opts = {};

  bot.sendMessage(chatId, "inline keyboard", {
    reply_markup: {
      inline_keyboard: [[{ text: "movie" }]],
    },
  });
};
