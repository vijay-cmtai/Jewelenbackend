const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/authMiddleware.js");

const {
  addJewelry,
  uploadFromCsv,
  getJewelry,
  getJewelryById,
  updateJewelry,
  deleteJewelry,
  getJewelryBySku,
  getSellerJewelry,
  updateJewelryStock,
  previewCsvHeaders,
  previewHeadersFromUrl,
  previewFtpHeaders,
  getCollections,
} = require("../controllers/inventoryController.js");

router.route("/").get(getJewelry);
router.route("/add-manual").post(protect, addJewelry);
router.route("/upload-csv").post(protect, uploadFromCsv);

router.route("/my-inventory").get(protect, getSellerJewelry);
router.route("/:id/stock").put(protect, updateJewelryStock);

router.route("/preview-csv-headers").post(protect, previewCsvHeaders);
router.route("/preview-headers-url").post(protect, previewHeadersFromUrl);
router.route("/preview-ftp-headers").post(protect, previewFtpHeaders);

// Yeh route '/:id' se pehle honi chahiye
router.route("/collections").get(getCollections);

router.route("/sku/:sku").get(getJewelryBySku);

router
  .route("/:id")
  .get(getJewelryById)
  .put(protect, updateJewelry)
  .delete(protect, deleteJewelry);

module.exports = router;
