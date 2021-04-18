sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"../model/formatter",
	"sap/ui/core/format/DateFormat"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, FilterOperator, formatter, DateFormat) {
	"use strict";

	return BaseController.extend("project.data.ProjectData.controller.TimeTypes", {

		formatter: formatter,

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		onInit: function () {
			// Model used to manipulate control states. The chosen values make sure,
			// detail page is busy indication immediately so there is no break in
			// between the busy indication for loading the view's meta data
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				mode: "None",
				enableSave: false,
				lineItemTableDelay: 0,
				timeTypesTitle: "",
				timeTypeID: ""
			});
			this.setModel(oViewModel, "timeTypesView");

			this.getRouter().getRoute("TimeTypes").attachPatternMatched(this._onObjectMatched, this);
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		_onObjectMatched: function (oEvent) {
			var sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sObjectId = oEvent.getParameter("arguments").objectId,
				oModel = this.getModel(),
				oContext,
				sPath,
				sTitle;
			// sMode = oEvent.getParameter("arguments").mode; doesn't work here; detect mode by appView/value of sObjectId

			if (this.getModel("appView").getProperty("mode") === "Create" || sObjectId === "xxx") { // revisit: passing an undefined objectId doesn't work
				oContext = oModel.createEntry("/TimeTypes", {
					properties: {
						project_ID: sProjectID
					}
				});
				sTitle = this.getResourceBundle().getText("timeTypesViewTitleCreate");
				this.byId("code").setValue("");
				this.byId("wageChange").setValue("0");
				this.byId("breakTime").setSelected(false);
			} else {
				sPath = "/" + oModel.createKey("TimeTypes", {
					ID: sObjectId
				});
				oContext = new sap.ui.model.Context(oModel, sPath);
				sTitle = this.getResourceBundle().getText("timeTypesViewTitleEdit");
			}
			this.getView().setBindingContext(oContext);
			this.byId("titleId").setText(sTitle);
		},

		onSave: function () {
			var oModel = this.getModel(),
				oView = this.getModel("timeTypesView"),
				oBC = this.getView().getBindingContext(),
				sCode = this.byId("code").getValue(),
				sWageChange = this.byId("wageChange").getValue(),
				bBreakTime = this.byId("breakTime").getSelected();

			if (!sWageChange || sWageChange === "") {
				sWageChange = "0.00";
			}
			oModel.setProperty("code", sCode, oBC);
			oModel.setProperty("wageIncrease", sWageChange, oBC);
			oModel.setProperty("breakTime", bBreakTime, oBC);
			oModel.submitChanges();
			oView.setProperty("/enableSave", false);
			this.onCloseDetailPress();
		},

		_validateSaveEnablement: function () {
			var oView = this.getModel("timeTypesView"),
				oBC = this.getView().getBindingContext(),
				oData = oBC.getObject(),
				sCode = this.byId("code").getValue(),
				sWageChange = this.byId("wageChange").getValue(),
				bBreakTime = this.byId("breakTime").getSelected();

			oView.setProperty("/enableSave", false);
			if (sCode) { // required
				if (sCode !== oData.code || sWageChange !== oData.wageIncrease || bBreakTime !== oData.breakTime) {
					oView.setProperty("/enableSave", true);
				}
			}
		},

		onDeleteTimeType: function () {
			var sPath = this.getView().getBindingContext().getPath(),
				oModel = this.getModel(),
				sConfirmText = this.getResourceBundle().getText("confirmDeletionTimeTypeText"),
				sConfirmTitle = this.getResourceBundle().getText("confirmDeletionTimeTypeTitle");

			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
					initialFocus: MessageBox.Action.CANCEL,
					onClose: function (sAction) {
						if (sAction === "OK") {
							oModel.remove(sPath);
						}
					}
				}
			);
			this.onCloseDetailPress();
		},

		onCancel: function () {
			this.onCloseDetailPress();
		},

		onCloseDetailPress: function () {
			var oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID");
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", false);
			if (oModel.hasPendingChanges(false)) {
				oModel.resetChanges(); // just in case 
			}
			this.getRouter().navTo("object", {
				objectId: sProjectID
			});
		},

		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/endColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "EndColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		}

	});

});